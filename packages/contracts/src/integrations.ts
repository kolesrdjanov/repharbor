import { z } from 'zod';
import { currency, id, minor, timestamp } from './base';

export const providerName = z.enum(['stripe', 'dodo', 'whop', 'revenuecat']);
export const providerEnvironment = z.enum(['test', 'live']);
export const providerCredentials = z.strictObject({
  apiKey: z.string().min(1).max(4096).optional(),
  webhookSecret: z.string().min(1).max(4096).optional(),
  authorizationToken: z.string().min(1).max(4096).optional(),
}).refine((value) => Object.values(value).some(Boolean), 'Supply the required provider credentials.');

export const connectProvider = z.strictObject({
  provider: providerName, environment: providerEnvironment, externalAccount: z.string().min(1).max(255),
  credentials: providerCredentials,
});
export const reconnectProvider = z.strictObject({ credentials: providerCredentials });
export const productMapping = z.strictObject({
  productId: id, externalProduct: z.string().trim().min(1).max(1024),
  channel: z.string().trim().min(1).max(64), authoritative: z.boolean(),
});
export const setMappings = z.strictObject({ items: z.array(productMapping).max(100) });
export const reviewItem = z.strictObject({
  id, effectId: id, reason: z.string().min(1), customerLabel: z.string().min(1),
  candidateClaimIds: z.array(id),
  candidateClaims: z.array(z.strictObject({ id, customerLabel: z.string().min(1) })).optional(), resolvedAt: timestamp.optional(),
  currency: currency.optional(), amountMinor: minor.optional(),
  postedEngagementId: id.optional(), postedEntryId: id.optional(),
});
export const resolveReview = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('assign_claim'), claimId: id, reason: z.string().trim().min(1).max(1000) }),
  z.strictObject({ action: z.literal('mark_ineligible'), reason: z.string().trim().min(1).max(1000) }),
]);
export const coverageGap = z.strictObject({
  id, startsAt: timestamp, endsAt: timestamp.optional(), reason: z.string().min(1), resolvedAt: timestamp.optional(),
});
export const backfillInput = z.strictObject({ start: timestamp, end: timestamp });
