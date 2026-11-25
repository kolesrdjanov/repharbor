import { z } from 'zod';
import { ApiError } from '../../http';
import type { DeliveryHeaders, Effect, Envelope, ProviderAdapter, Source } from '../provider';
import { currencyCode, exactHeader, fetchData, fixture, minorFromMajor, parsePayload } from './protocol';

const data = z.object({
  id: z.string(), type: z.string(), event_timestamp_ms: z.number().int(),
  environment: z.enum(['SANDBOX', 'PRODUCTION']).optional(), app_id: z.string().optional(),
  app_user_id: z.string().optional(), original_app_user_id: z.string().optional(), aliases: z.array(z.string()).optional(),
  store: z.string().optional(), transaction_id: z.string().optional(), original_transaction_id: z.string().optional(),
  product_id: z.string().optional(), purchased_at_ms: z.number().int().optional(),
  currency: currencyCode.nullish(), price_in_purchased_currency: z.number().nullish(),
  tax_percentage: z.number().nullish(), cancel_reason: z.string().optional(),
});
const purchase = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE']);
const web = new Set(['STRIPE', 'RC_BILLING', 'PADDLE']);

export class RevenueCatAdapter implements ProviderAdapter {
  constructor(private readonly fixturesEnabled: boolean) {}

  async configure(source: Source) {
    const [project, app, extra] = source.externalAccount.split('/');
    if (!project || !app || extra || !source.credentials.authorizationToken) {
      throw new ApiError(422, 'INVALID_CREDENTIALS', 'Enter project ID/app ID and the configured authorization header.');
    }
    if (fixture(source, this.fixturesEnabled, 'proj_fixture_')) return;
    if (!source.credentials.apiKey) throw new ApiError(422, 'INVALID_CREDENTIALS', 'Enter a RevenueCat API v2 key.');
    try {
      const path = `/v2/projects/${encodeURIComponent(project)}/apps/${encodeURIComponent(app)}`;
      const result = await fetchData(new URL(path, 'https://api.revenuecat.com'), source, z.object({ id: z.string() }));
      if (result.id !== app) throw new Error('App mismatch');
    } catch {
      throw new ApiError(422, 'ACCOUNT_UNVERIFIED', 'Check the RevenueCat project, app and API read permissions.');
    }
  }

  verifyDelivery(body: Buffer, headers: DeliveryHeaders, source: Source): Envelope {
    exactHeader(headers.authorization, source.credentials.authorizationToken);
    const { event } = parsePayload(body, z.object({ event: data }));
    const app = source.externalAccount.split('/')[1];
    const financial = purchase.has(event.type) || event.type === 'REFUND_REVERSED'
      || (event.type === 'CANCELLATION' && event.cancel_reason === 'CUSTOMER_SUPPORT');
    if ((event.app_id && event.app_id !== app) || (financial && (!event.app_id || !event.environment))) {
      throw new ApiError(403, 'SOURCE_MISMATCH', 'The authenticated delivery does not match the source configuration.');
    }
    return {
      eventId: event.id, account: source.externalAccount, type: event.type,
      environment: event.environment === 'SANDBOX' ? 'test' : event.environment === 'PRODUCTION' ? 'live' : source.environment,
      occurredAt: new Date(event.event_timestamp_ms).toISOString(), data: event,
    };
  }

  async normalize(envelope: Envelope): Promise<Effect[]> {
    const event = data.parse(envelope.data);
    const original = purchase.has(event.type);
    const reversal = event.type === 'REFUND_REVERSED';
    const refund = event.type === 'CANCELLATION' && event.cancel_reason === 'CUSTOMER_SUPPORT'
      && (event.price_in_purchased_currency ?? 0) < 0;
    if (!original && !reversal && !refund) return [];
    const currency = event.currency ?? 'XXX';
    const amount = event.price_in_purchased_currency == null ? undefined
      : minorFromMajor(event.price_in_purchased_currency, currency);
    if (amount === 0n) return [];
    const transaction = event.transaction_id ?? event.id;
    const store = event.store ?? 'unknown';
    const providerKey = `${store}:${transaction}`;
    const user = [event.original_app_user_id, event.app_user_id, ...(event.aliases ?? [])]
      .find((value) => value && !value.startsWith('$RCAnonymousID:'));
    return [{
      transactionKey: providerKey, lineKey: 'purchase', effectKey: original ? 'collection' : `${event.type}:${transaction}`,
      kind: original ? 'collection' : reversal ? 'refund_reversal' : 'refund',
      externalProduct: event.product_id ?? 'unidentified', externalCustomer: user ?? event.app_user_id ?? 'unidentified',
      originalExternalKey: providerKey, channel: web.has(store) ? 'web' : store.toLowerCase(),
      occurredAt: original && event.purchased_at_ms ? new Date(event.purchased_at_ms).toISOString() : envelope.occurredAt,
      currency, amountMinor: String(amount === undefined ? 0n : amount < 0n ? -amount : amount),
      // RevenueCat tax_percentage is an estimate, including when it appears to be zero.
      reviewReason: original ? undefined : 'REFUND_BASIS_UNKNOWN',
    }];
  }

  async importPage(_source: Source, window: { start: Date; end: Date }) {
    return { events: [], unavailableBefore: window.end };
  }
}
