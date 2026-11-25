import { z } from 'zod';
import { currency, timestamp, providerName, providerEnvironment, providerCredentials } from '@repharbor/contracts';

export type Provider = z.infer<typeof providerName>;
export type Environment = z.infer<typeof providerEnvironment>;
export type Credentials = z.infer<typeof providerCredentials>;

export type Source = {
  id: string;
  companyId: string;
  provider: Provider;
  environment: Environment;
  externalAccount: string;
  credentials: Credentials;
};

const externalId = z.string().min(1).max(1024);
export const envelope = z.strictObject({
  eventId: externalId,
  environment: providerEnvironment,
  account: externalId.optional(),
  type: externalId,
  occurredAt: timestamp,
  data: z.record(z.string(), z.json()),
});
export type Envelope = z.infer<typeof envelope>;

const amount = z.string().regex(/^(0|[1-9][0-9]*)$/).refine((value) => BigInt(value) <= (1n << 63n) - 1n);
export const normalizedEffect = z.strictObject({
  transactionKey: externalId, lineKey: externalId, effectKey: externalId,
  kind: z.enum(['collection', 'refund', 'refund_reversal']),
  externalProduct: externalId, externalCustomer: externalId, channel: externalId,
  occurredAt: timestamp, currency, amountMinor: amount, basisMinor: amount.optional(),
  originalExternalKey: externalId.optional(), reviewReason: externalId.optional(),
});
export type Effect = z.infer<typeof normalizedEffect>;
export type DeliveryHeaders = Record<string, string | string[] | undefined>;

export interface ProviderAdapter {
  configure(source: Source): Promise<void>;
  verifyDelivery(raw: Buffer, headers: DeliveryHeaders, source: Source): Envelope;
  normalize(event: Envelope, source: Source): Promise<Effect[]>;
  importPage(source: Source, window: { start: Date; end: Date }, cursor?: string): Promise<{
    events: Envelope[];
    nextCursor?: string;
    unavailableBefore?: Date;
  }>;
}
