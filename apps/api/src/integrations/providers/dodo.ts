import { z } from 'zod';
import { ApiError } from '../../http';
import type { DeliveryHeaders, Effect, Envelope, ProviderAdapter, Source } from '../provider';
import { authError, checkAccount, currencyCode, dateString, fetchData, fixture, minorInteger, parsePayload, signaturePayload } from './protocol';

const payment = z.object({
  payment_id: z.string(), business_id: z.string().optional(), total_amount: minorInteger,
  currency: currencyCode, tax: minorInteger.nullish(), status: z.string().nullish(),
  customer: z.object({ customer_id: z.string() }), created_at: dateString,
  product_cart: z.array(z.object({ product_id: z.string() })).nullish(),
  subscription_id: z.string().nullish(), subscription_ids: z.array(z.string()).optional(),
  service_periods: z.array(z.object({ starts_at: dateString })).optional(),
});
const refund = z.object({
  refund_id: z.string(), business_id: z.string().optional(), payment_id: z.string(),
  status: z.string(), amount: minorInteger.nullish(), currency: currencyCode.nullish(), created_at: dateString,
});
const incoming = z.object({ business_id: z.string(), type: z.string(), timestamp: dateString, data: z.unknown() });
const term = z.object({ subscription_id: z.string(), product_id: z.string(), business_id: z.string().optional() });
const identifier = z.object({ payment_id: z.string() });

function url(source: Source, path: string) {
  return new URL(path, source.environment === 'test' ? 'https://test.dodopayments.com' : 'https://live.dodopayments.com');
}

function signKey(secret?: string) {
  if (!secret) throw authError();
  return secret.startsWith('whsec_') ? Buffer.from(secret.slice(6), 'base64') : Buffer.from(secret);
}

export class DodoAdapter implements ProviderAdapter {
  constructor(private readonly fixturesEnabled: boolean) {}

  async configure(source: Source) {
    if (!source.credentials.webhookSecret || !source.externalAccount.startsWith('bus_')) {
      throw new ApiError(422, 'INVALID_CREDENTIALS', 'Enter the Dodo business ID and webhook signing secret.');
    }
    if (fixture(source, this.fixturesEnabled, 'bus_fixture_')) return;
    const key = source.credentials.apiKey;
    if (!key || (key.startsWith('dodo_test_') && source.environment !== 'test')
      || (key.startsWith('dodo_live_') && source.environment !== 'live')) {
      throw new ApiError(422, 'INVALID_CREDENTIALS', 'Enter a Dodo API key for this environment.');
    }
    try {
      const list = await fetchData(url(source, '/payments?page_size=1'), source, z.object({ items: z.array(identifier) }));
      if (list.items[0]) {
        const sample = await fetchData(url(source, `/payments/${encodeURIComponent(list.items[0].payment_id)}`), source, payment);
        checkAccount(source.externalAccount, sample.business_id);
      }
    } catch {
      throw new ApiError(422, 'ACCOUNT_UNVERIFIED', 'Check the Dodo business ID and payment read access.');
    }
  }

  verifyDelivery(body: Buffer, headers: DeliveryHeaders, source: Source): Envelope {
    const eventId = signaturePayload(body, headers, signKey(source.credentials.webhookSecret));
    const event = parsePayload(body, incoming);
    const data = event.type === 'payment.succeeded' ? payment.safeParse(event.data)
      : event.type === 'refund.succeeded' ? refund.safeParse(event.data) : undefined;
    if (data && !data.success) throw new ApiError(400, 'INVALID_PROVIDER_EVENT', 'The signed Dodo payload is unsupported.');
    return { eventId, environment: source.environment, account: event.business_id, type: event.type, occurredAt: event.timestamp, data: data?.data ?? {} };
  }

  async normalize(event: Envelope, source: Source): Promise<Effect[]> {
    if (event.type === 'refund.succeeded') {
      let row = refund.parse(event.data);
      if (source.credentials.apiKey && !event.eventId.startsWith('history:')) {
        row = await fetchData(url(source, `/refunds/${encodeURIComponent(row.refund_id)}`), source, refund);
        checkAccount(source.externalAccount, row.business_id);
      }
      if (row.status !== 'succeeded' || row.amount === 0) return [];
      const missing = row.amount == null || !row.currency;
      return [{
        transactionKey: row.payment_id, lineKey: 'unallocated', effectKey: row.refund_id, kind: 'refund',
        externalProduct: 'unidentified', externalCustomer: 'unidentified', channel: 'web',
        occurredAt: row.created_at, currency: row.currency ?? 'XXX', amountMinor: String(row.amount ?? 0),
        originalExternalKey: row.payment_id, reviewReason: missing ? 'REFUND_AMOUNT_UNKNOWN' : undefined,
      }];
    }
    if (event.type !== 'payment.succeeded') return [];
    let row = payment.parse(event.data);
    if (source.credentials.apiKey && !event.eventId.startsWith('history:')) {
      row = await fetchData(url(source, `/payments/${encodeURIComponent(row.payment_id)}`), source, payment);
      checkAccount(source.externalAccount, row.business_id);
    }
    if (row.status !== 'succeeded' || row.total_amount === 0) return [];
    const subscriptions = row.subscription_ids?.length ? row.subscription_ids : row.subscription_id ? [row.subscription_id] : [];
    const products = [...new Set(row.product_cart?.map(({ product_id }) => product_id) ?? [])];
    if (!products.length && subscriptions.length === 1 && source.credentials.apiKey) {
      const subscription = await fetchData(url(source, `/subscriptions/${encodeURIComponent(subscriptions[0])}`), source, term);
      checkAccount(source.externalAccount, subscription.business_id);
      products.push(subscription.product_id);
    }
    const identifier = products.length === 1 ? products[0]
      : !products.length && subscriptions.length === 1 ? `subscription:${subscriptions[0]}` : undefined;
    const basis = row.tax == null || row.tax > row.total_amount ? undefined : String(row.total_amount - row.tax);
    return [{
      transactionKey: row.payment_id, lineKey: 'payment', effectKey: 'collection', kind: 'collection',
      externalProduct: identifier ?? 'unidentified', externalCustomer: row.customer.customer_id, channel: 'web',
      occurredAt: row.service_periods?.[0]?.starts_at ?? row.created_at, currency: row.currency,
      amountMinor: String(row.total_amount), basisMinor: identifier ? basis : undefined, originalExternalKey: row.payment_id,
      reviewReason: identifier ? undefined : 'PRODUCT_ALLOCATION_UNKNOWN',
    }];
  }

  async importPage(source: Source, window: { start: Date; end: Date }, cursor?: string) {
    if (!source.credentials.apiKey) return { events: [], unavailableBefore: window.end };
    const [phase = 'payments', pageNumber = '0'] = cursor?.split(':') ?? [];
    const endpoint = url(source, `/${phase === 'refunds' ? 'refunds' : 'payments'}`);
    endpoint.search = new URLSearchParams({
      page_number: pageNumber, page_size: '5',
      created_at_gte: window.start.toISOString(), created_at_lte: window.end.toISOString(),
    }).toString();
    const events: Envelope[] = [];
    if (phase === 'refunds') {
      const { items } = await fetchData(endpoint, source, z.object({ items: z.array(refund) }));
      for (const item of items) {
        checkAccount(source.externalAccount, item.business_id);
        if (item.status !== 'succeeded' || new Date(item.created_at) >= window.end) continue;
        events.push({ eventId: `history:refund:${item.refund_id}`, account: source.externalAccount, environment: source.environment,
          type: 'refund.succeeded', occurredAt: item.created_at, data: item });
      }
      return { events, nextCursor: items.length === 5 ? `refunds:${Number(pageNumber) + 1}` : undefined };
    }
    const { items } = await fetchData(endpoint, source, z.object({ items: z.array(identifier) }));
    const records = await Promise.all(items.map((item) =>
      fetchData(url(source, `/payments/${encodeURIComponent(item.payment_id)}`), source, payment),
    ));
    for (const row of records) {
      checkAccount(source.externalAccount, row.business_id);
      if (row.status !== 'succeeded' || new Date(row.created_at) >= window.end) continue;
      events.push({ eventId: `history:payment:${row.payment_id}`, account: source.externalAccount, environment: source.environment,
        type: 'payment.succeeded', occurredAt: row.created_at, data: row });
    }
    return { events, nextCursor: items.length === 5 ? `payments:${Number(pageNumber) + 1}` : 'refunds:0' };
  }
}
