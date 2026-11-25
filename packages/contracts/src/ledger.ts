import { z } from 'zod';
import { currency, id, localDate, minor, pagination, timestamp } from './base';

export const statementQuery = pagination.extend({ asOf: timestamp.optional(), currency: currency.optional() });
export const reversePayment = z.strictObject({ reason: z.string().trim().min(1).max(1000) });
export const proposeOpening = z.strictObject({
  currency, amountMinor: minor, asOf: localDate, note: z.string().trim().min(1).max(1000),
});
export const opening = proposeOpening.extend({ id, engagementId: id, acceptedAt: timestamp.optional() });
