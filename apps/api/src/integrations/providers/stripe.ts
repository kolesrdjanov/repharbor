import Stripe from 'stripe';
import { z } from 'zod';
import { ApiError } from '../../http';
import type { Effect, Envelope, ProviderAdapter, Source } from '../provider';

const eventSchema = z.object({
  id: z.string().min(1), account: z.string().optional(), livemode: z.boolean(), created: z.number().int(),
  type: z.string(), data: z.object({ object: z.record(z.string(), z.json()) }),
});
const minor = z.number().int();
const objectId = z.union([z.string(), z.object({ id: z.string() })]).transform((value) =>
  typeof value === 'string' ? value : value.id,
);
const lineSchema = z.object({
  id: z.string(), amount: minor, currency: z.string(), subtotal: minor.optional(),
  amount_excluding_tax: minor.nullish(),
  discount_amounts: z.array(z.object({ amount: minor })).nullish(),
  pretax_credit_amounts: z.array(z.object({ amount: minor })).nullish(),
  taxes: z.array(z.object({ amount: minor })).nullish(),
  tax_amounts: z.array(z.object({ amount: minor })).nullish(),
  price: z.object({ product: objectId }).nullish(),
  pricing: z.object({ price_details: z.object({ product: objectId }).nullish() }).nullish(),
});
const paymentSchema = z.object({
  status: z.string(), amount_paid: minor.nullish(),
  payment: z.object({ type: z.string(), payment_intent: objectId.nullish() }),
});
const invoiceSchema = z.object({
  id: z.string(), status: z.string().nullish(), amount_paid: minor, customer: objectId.nullish(),
  currency: z.string(), paid_out_of_band: z.boolean().optional(),
  status_transitions: z.object({ paid_at: z.number().int().nullish() }).optional(),
  lines: z.object({ data: z.array(lineSchema), has_more: z.boolean() }),
  payments: z.object({ data: z.array(paymentSchema), has_more: z.boolean() }).optional(),
});
const refundSchema = z.object({
  id: z.string(), amount: minor.nonnegative(), currency: z.string(), status: z.string().nullable(),
  payment_intent: objectId.nullable(), created: z.number().int(),
});

const acceptedTypes = ['invoice.paid', 'refund.created', 'refund.updated'] as const;

function projectEvent(input: unknown, account: string): Envelope {
  const event = eventSchema.parse(input);
  let data: Envelope['data'] = {};
  if (event.type === 'invoice.paid') data = invoiceSchema.parse(event.data.object);
  if (event.type === 'refund.created' || event.type === 'refund.updated') data = refundSchema.parse(event.data.object);
  return {
    eventId: event.id,
    environment: event.livemode ? 'live' : 'test',
    account: event.account ?? account,
    type: event.type,
    occurredAt: new Date(event.created * 1000).toISOString(),
    data,
  };
}

function client(source: Source) {
  return new Stripe(source.credentials.apiKey ?? 'sk_test_fixture_placeholder', { timeout: 12_000, maxNetworkRetries: 0 });
}

function lineAmounts(line: z.output<typeof lineSchema>) {
  const subtotal = line.subtotal ?? line.amount_excluding_tax;
  const taxes = line.taxes ?? line.tax_amounts;
  if (subtotal == null || taxes == null || line.discount_amounts == null) return undefined;
  const credits = line.pretax_credit_amounts ?? line.discount_amounts;
  const basis = BigInt(subtotal) - credits.reduce((total, item) => total + BigInt(item.amount), 0n);
  if (basis < 0n) return undefined;
  return { basis, gross: basis + taxes.reduce((total, item) => total + BigInt(item.amount), 0n) };
}

async function collect(event: Envelope, source: Source): Promise<Effect[]> {
  const invoice = invoiceSchema.parse(event.data);
  if (invoice.status !== 'paid' || invoice.paid_out_of_band || invoice.amount_paid <= 0) return [];

  let lines = invoice.lines.data;
  let payments = invoice.payments?.data ?? [];
  if (source.credentials.apiKey) {
    const stripe = client(source);
    if (invoice.lines.has_more) {
      lines = (await stripe.invoices.listLineItems(invoice.id, { limit: 100 }).autoPagingToArray({ limit: 1000 }))
        .map((line) => lineSchema.parse(line));
    }
    if (!invoice.payments || invoice.payments.has_more) {
      payments = (await stripe.invoicePayments.list({ invoice: invoice.id, limit: 100 }).autoPagingToArray({ limit: 100 }))
        .map((payment) => paymentSchema.parse(payment));
    }
  }
  const paid = payments.filter(({ status, amount_paid }) => status === 'paid' && (amount_paid ?? 0) > 0);
  const payment = paid.length === 1 && paid[0].payment.type === 'payment_intent' ? paid[0] : undefined;
  const paymentId = payment?.payment.payment_intent;
  const confirmedCollection = Boolean(paymentId) && payment?.amount_paid === invoice.amount_paid;
  if (payments.length && !paid.length) return [];

  const amounts = lines.map(lineAmounts);
  const fullAllocation = Boolean(confirmedCollection && amounts.every(Boolean)
    && amounts.reduce((sum, amount) => sum + (amount?.gross ?? 0n), 0n) === BigInt(invoice.amount_paid));
  const occurredAt = invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : event.occurredAt;
  return lines.flatMap((line, index) => {
    const amount = amounts[index];
    const gross = amount?.gross ?? BigInt(line.amount);
    if (gross <= 0n) return [];
    const product = line.pricing?.price_details?.product ?? line.price?.product;
    return [{
      transactionKey: invoice.id, lineKey: line.id, effectKey: 'collection', kind: 'collection',
      externalProduct: product ?? 'unidentified', externalCustomer: invoice.customer ?? 'unidentified', channel: 'web',
      occurredAt, currency: line.currency.toUpperCase(),
      amountMinor: gross.toString(), basisMinor: fullAllocation && amount ? amount.basis.toString() : undefined,
      originalExternalKey: paymentId ?? undefined,
      reviewReason: !confirmedCollection ? 'COLLECTION_UNVERIFIED' : undefined,
    }];
  });
}

export class StripeAdapter implements ProviderAdapter {
  constructor(private readonly fixturesEnabled: boolean) {}

  async configure(source: Source) {
    if (!/^whsec_[A-Za-z0-9]+/.test(source.credentials.webhookSecret ?? '')) {
      throw new ApiError(422, 'INVALID_CREDENTIALS', 'Enter a Stripe webhook signing secret.');
    }
    if (!source.credentials.apiKey && this.fixturesEnabled && source.environment === 'test'
      && source.externalAccount.startsWith('acct_fixture_')) return;

    const prefix = source.environment === 'test' ? /^(sk|rk)_test_/ : /^(sk|rk)_live_/;
    if (!prefix.test(source.credentials.apiKey ?? '')) {
      throw new ApiError(422, 'INVALID_CREDENTIALS', 'Enter an API key for the selected Stripe environment.');
    }
    const account = await client(source).accounts.retrieveCurrent().catch(() => null);
    if (!account || account.id !== source.externalAccount) {
      throw new ApiError(422, 'ACCOUNT_UNVERIFIED', 'Check the Stripe account ID and API key permissions.');
    }
  }

  verifyDelivery(raw: Buffer, headers: Parameters<ProviderAdapter['verifyDelivery']>[1], source: Source) {
    const signature = headers['stripe-signature'];
    if (typeof signature !== 'string' || !source.credentials.webhookSecret) {
      throw new ApiError(401, 'WEBHOOK_AUTH_FAILED', 'Delivery authentication failed.');
    }
    let verified: Stripe.Event;
    try {
      verified = client(source).webhooks.constructEvent(raw, signature, source.credentials.webhookSecret);
    } catch {
      throw new ApiError(401, 'WEBHOOK_AUTH_FAILED', 'Delivery authentication failed.');
    }
    try {
      return projectEvent(verified, source.externalAccount);
    } catch {
      throw new ApiError(400, 'INVALID_PROVIDER_EVENT', 'The signed Stripe payload is unsupported.');
    }
  }

  async normalize(event: Envelope, source: Source): Promise<Effect[]> {
    if (event.type === 'invoice.paid') return collect(event, source);
    if (event.type !== 'refund.created' && event.type !== 'refund.updated') return [];
    const data = refundSchema.parse(event.data);
    if (data.status !== 'succeeded' || !data.amount) return [];
    return [{
      transactionKey: data.payment_intent ?? data.id, lineKey: 'unallocated', effectKey: data.id, kind: 'refund',
      externalProduct: 'unidentified', externalCustomer: 'unidentified', channel: 'web',
      occurredAt: new Date(data.created * 1000).toISOString(), currency: data.currency.toUpperCase(),
      amountMinor: String(data.amount), originalExternalKey: data.payment_intent ?? undefined,
      reviewReason: data.payment_intent ? undefined : 'REFUND_ORIGINAL_UNKNOWN',
    }];
  }

  async importPage(source: Source, window: { start: Date; end: Date }, cursor?: string) {
    const earliest = new Date(Date.now() - 30 * 86_400_000);
    if (!source.credentials.apiKey) return { events: [], unavailableBefore: window.end };
    const start = window.start > earliest ? window.start : earliest;
    if (start >= window.end) return { events: [], unavailableBefore: window.end };
    const page = await client(source).events.list({
      types: [...acceptedTypes], limit: 100, starting_after: cursor,
      created: { gte: Math.ceil(start.getTime() / 1000), lt: Math.ceil(window.end.getTime() / 1000) },
    });
    return {
      events: page.data.map((event) => projectEvent(event, source.externalAccount)),
      nextCursor: page.has_more ? page.data.at(-1)?.id : undefined,
      unavailableBefore: window.start < earliest ? earliest : undefined,
    };
  }
}
