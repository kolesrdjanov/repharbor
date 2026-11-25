import { z } from 'zod';
import { ApiError } from '../../http';
import type { DeliveryHeaders, Effect, Envelope, ProviderAdapter, Source } from '../provider';
import {
  checkAccount, currencyCode, dateString, fetchData, fixture, minorFromMajor, parsePayload, signaturePayload,
} from './protocol';

const money = z.object({ amount: z.union([z.string(), z.number()]), currency: currencyCode, decimals: z.number().int().optional() });
const payment = z.object({
  id: z.string(), account_id: z.string().nullish(), company_id: z.string().nullish(), status: z.string(),
  paid_at: dateString.nullish(), product_id: z.string().nullish(), variant_id: z.string().nullish(),
  plan_id: z.string().nullish(), product: z.object({ id: z.string() }).nullish(),
  plan: z.object({ id: z.string() }).nullish(), user: z.object({ id: z.string() }).nullish(),
  membership: z.object({ id: z.string() }).nullish(), membership_id: z.string().nullish(),
  presentment_total: money.nullish(), presentment_tax_amount: money.nullish(),
  total: money.nullish(), tax_amount: money.nullish(),
});
const refund = z.object({
  id: z.string(), account_id: z.string().nullish(), company_id: z.string().nullish(),
  payment_id: z.string(), status: z.string(), original_amount: money.nullish(), amount: money.nullish(), created_at: dateString,
});
const incoming = z.object({
  id: z.string(), type: z.string(), timestamp: dateString, account_id: z.string().optional(), company_id: z.string().optional(),
  data: z.unknown(),
});
const pageInfo = z.object({ has_next_page: z.boolean(), end_cursor: z.string().nullish() });
const headers = { 'Api-Version-Date': '2026-11-23-3' };

function url(source: Source, path: string) {
  return new URL(`/api/v1${path}`, source.environment === 'test' ? 'https://sandbox-api.whop.com' : 'https://api.whop.com');
}

function minor(row: z.infer<typeof money>) {
  return minorFromMajor(row.amount, row.currency, row.decimals);
}

export class WhopAdapter implements ProviderAdapter {
  constructor(private readonly fixturesEnabled: boolean) {}

  async configure(source: Source) {
    if (!source.credentials.webhookSecret?.startsWith('ws_') || !source.externalAccount.startsWith('biz_')) {
      throw new ApiError(422, 'INVALID_CREDENTIALS', 'Enter the Whop account ID and ws_ webhook secret.');
    }
    if (fixture(source, this.fixturesEnabled, 'biz_fixture_')) return;
    if (!source.credentials.apiKey) throw new ApiError(422, 'INVALID_CREDENTIALS', 'Enter a Whop API key for this environment.');
    try {
      const endpoint = url(source, '/payments');
      endpoint.search = new URLSearchParams({ account_id: source.externalAccount, first: '1' }).toString();
      const result = await fetchData(endpoint, source, z.object({ data: z.array(payment), page_info: pageInfo }), headers);
      for (const row of result.data) checkAccount(source.externalAccount, row.account_id ?? row.company_id);
    } catch {
      throw new ApiError(422, 'ACCOUNT_UNVERIFIED', 'Check the Whop account and payments read permissions.');
    }
  }

  verifyDelivery(body: Buffer, requestHeaders: DeliveryHeaders, source: Source): Envelope {
    const eventId = signaturePayload(body, requestHeaders, Buffer.from(source.credentials.webhookSecret ?? ''));
    const event = parsePayload(body, incoming);
    const data = event.type === 'payment.succeeded' ? payment.safeParse(event.data)
      : event.type === 'refund.created' || event.type === 'refund.updated' ? refund.safeParse(event.data) : undefined;
    if (event.id !== eventId || (data && !data.success)) {
      throw new ApiError(400, 'INVALID_PROVIDER_EVENT', 'The signed Whop payload is unsupported.');
    }
    const account = event.account_id ?? event.company_id;
    if (data?.data) checkAccount(account ?? source.externalAccount, data.data.account_id ?? data.data.company_id);
    return { eventId, account, environment: source.environment, type: event.type, occurredAt: event.timestamp, data: data?.data ?? {} };
  }

  async normalize(event: Envelope, source: Source): Promise<Effect[]> {
    if (event.type === 'refund.created' || event.type === 'refund.updated') {
      let row = refund.parse(event.data);
      if (source.credentials.apiKey && !event.eventId.startsWith('history:')) {
        row = await fetchData(url(source, `/refunds/${encodeURIComponent(row.id)}`), source, refund, headers);
        checkAccount(source.externalAccount, row.account_id ?? row.company_id);
      }
      if (row.status !== 'succeeded') return [];
      const value = row.original_amount ?? row.amount;
      const amount = value ? minor(value) : undefined;
      if (amount === 0n) return [];
      return [{
        transactionKey: row.payment_id, lineKey: 'unallocated', effectKey: row.id, kind: 'refund',
        externalProduct: 'unidentified', externalCustomer: 'unidentified', channel: 'web',
        occurredAt: row.created_at, currency: value?.currency ?? 'XXX', amountMinor: String(amount === undefined ? 0n : amount < 0n ? -amount : amount),
        originalExternalKey: row.payment_id, reviewReason: amount === undefined ? 'REFUND_AMOUNT_UNKNOWN' : undefined,
      }];
    }
    if (event.type !== 'payment.succeeded') return [];
    let row = payment.parse(event.data);
    if (source.credentials.apiKey && !event.eventId.startsWith('history:')) {
      row = await fetchData(url(source, `/payments/${encodeURIComponent(row.id)}`), source, payment, headers);
      checkAccount(source.externalAccount, row.account_id ?? row.company_id);
    }
    if (!row.paid_at) return [];
    const total = row.presentment_total ?? row.total;
    const tax = row.presentment_total ? row.presentment_tax_amount : row.tax_amount;
    const gross = total ? minor(total) : undefined;
    const taxMinor = tax === null ? 0n : tax && tax.currency === total?.currency ? minor(tax) : undefined;
    if (gross === 0n) return [];
    const basis = gross !== undefined && taxMinor !== undefined && gross >= taxMinor && taxMinor >= 0n ? gross - taxMinor : undefined;
    return [{
      transactionKey: row.id, lineKey: 'payment', effectKey: 'collection', kind: 'collection',
      originalExternalKey: row.id, externalProduct: row.product_id ?? row.product?.id ?? row.variant_id ?? row.plan_id ?? row.plan?.id ?? 'unidentified',
      externalCustomer: row.user?.id ?? row.membership_id ?? row.membership?.id ?? 'unidentified', channel: 'web',
      occurredAt: row.paid_at, currency: total?.currency ?? 'XXX',
      amountMinor: String(gross !== undefined && gross > 0n ? gross : 0n), basisMinor: basis?.toString(),
    }];
  }

  async importPage(source: Source, window: { start: Date; end: Date }, cursor?: string) {
    if (!source.credentials.apiKey) return { events: [], unavailableBefore: window.end };
    const [phase = 'payments', cursorValue] = cursor?.split('|') ?? [];
    const endpoint = url(source, phase === 'refunds' ? '/refunds' : '/payments');
    endpoint.search = new URLSearchParams({
      account_id: source.externalAccount, first: '50',
      created_after: window.start.toISOString(), created_before: window.end.toISOString(),
      ...(cursorValue && { after: cursorValue }),
    }).toString();
    const events: Envelope[] = [];
    if (phase === 'refunds') {
      const { data, page_info } = await fetchData(endpoint, source, z.object({ data: z.array(refund), page_info: pageInfo }), headers);
      for (const row of data) {
        checkAccount(source.externalAccount, row.account_id ?? row.company_id);
        if (row.status === 'succeeded') events.push({ eventId: `history:refund:${row.id}`, environment: source.environment,
          account: source.externalAccount, type: 'refund.updated', occurredAt: row.created_at, data: row });
      }
      return { events, nextCursor: page_info.has_next_page && page_info.end_cursor ? `refunds|${page_info.end_cursor}` : undefined };
    }
    const { data, page_info } = await fetchData(endpoint, source, z.object({ data: z.array(payment), page_info: pageInfo }), headers);
    for (const row of data) {
      checkAccount(source.externalAccount, row.account_id ?? row.company_id);
      if (row.paid_at && new Date(row.paid_at) >= window.start && new Date(row.paid_at) < window.end) {
        events.push({ eventId: `history:payment:${row.id}`, environment: source.environment,
          account: source.externalAccount, type: 'payment.succeeded', occurredAt: row.paid_at, data: row });
      }
    }
    return { events, nextCursor: page_info.has_next_page && page_info.end_cursor ? `payments|${page_info.end_cursor}` : 'refunds' };
  }
}
