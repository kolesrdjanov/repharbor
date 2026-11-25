import { z } from 'zod';
import type { operations } from './wire';

export type { components, operations, paths } from './wire';

export const id = z.uuid();
export const email = z.email();
export const timestamp = z.iso.datetime();
export const localDate = z.iso.date();
export const currency = z.string().regex(/^[A-Z]{3}$/);
export const minor = z.string().regex(/^(0|-?[1-9][0-9]*)$/);
export const positiveMinor = z.string().regex(/^[1-9][0-9]*$/);
export const rateBps = z.number().int().min(0).max(10_000);
const text = z.string().min(1);
export const timeZone = text.refine((value) => {
  if (value.startsWith('+') || value.startsWith('-')) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, 'Enter a valid IANA time zone.');

export const health = z.strictObject({ status: z.literal("ok") });

export const apiError = z.strictObject({
  code: text, message: text, requestId: text,
  fieldErrors: z.record(text, z.array(text)).optional(),
});

export const pagination = z.strictObject({
  cursor: text.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export function page<T extends z.ZodType>(item: T) {
  return z.strictObject({ items: z.array(item), nextCursor: text.optional() });
}

export const company = z.strictObject({ id, name: text, timeZone });
export const product = z.strictObject({ id, companyId: id, name: text });
export const session = z.strictObject({
  userId: id, email, companies: z.array(company), pendingInvitationId: id.optional(), returnPath: text.optional(),
});
export const requestMagicLink: z.ZodType<operations['requestMagicLink']['requestBody']['content']['application/json']> =
  z.strictObject({
    email: z.string().trim().toLowerCase().pipe(email),
    returnPath: text.optional(),
    invitationToken: text.optional(),
  });
export const exchangeMagicLink = z.strictObject({ token: text });

export const engagement = z.strictObject({
  id, companyId: id, productId: id, repId: id.optional(),
  status: z.enum(['invited', 'active', 'closed']),
});
export const terms = z.strictObject({
  rateBps, basis: z.literal('collected_ex_tax_before_fees'),
  accrualMode: z.enum(['first_payment', 'recurring']),
  eligibilityMonths: z.number().int().positive(),
  refundPolicy: z.literal('reverse_original_rate'),
  cadence: z.literal('monthly'),
  dueDay: z.number().int().min(1).max(28),
  timeZone, effectiveAt: timestamp,
});
export const agreement = terms.extend({
  id, engagementId: id, revision: z.number().int().nonnegative(),
  founderAcceptedAt: timestamp, repAcceptedAt: timestamp.optional(),
});
export const claim = z.strictObject({
  id, engagementId: id, customerLabel: text, status: z.enum(['pending', 'approved', 'declined']),
  contactEmail: email.optional(), reason: text.optional(),
  competingClaimCount: z.number().int().nonnegative().optional(),
});
export const connection = z.strictObject({
  id, companyId: id, provider: z.enum(['stripe', 'dodo', 'whop', 'revenuecat']),
  environment: z.enum(['test', 'live']), externalAccount: text,
  status: z.enum(['pending', 'active', 'degraded', 'disconnected']),
  coverageFrom: timestamp.optional(), lastDeliveryAt: timestamp.optional(), reconciledAt: timestamp.optional(),
});
export const balance = z.strictObject({
  currency, accruedMinor: minor, recordedPaymentsMinor: minor, outstandingMinor: minor, dueMinor: minor,
  openingStatus: z.enum(['known', 'unknown']),
});

export const entry = z.strictObject({
  id, engagementId: id, kind: z.enum(['commission', 'refund', 'refund_reversal', 'external_payment', 'opening', 'reversal']),
  currency, deltaMinor: minor, effectiveAt: timestamp, postedAt: timestamp,
  dueOn: localDate.optional(), basisMinor: minor.optional(), rateBps: rateBps.optional(),
  agreementId: id.optional(), customerLabel: text.optional(), source: connection.shape.provider.optional(),
  sourceTransactionRef: text.optional(), relatedEntryId: id.optional(), paymentId: id.optional(),
  recordedBy: id.optional(), reason: text.optional(),
  paidOn: localDate.optional(), paymentReference: text.optional(),
});
export const statement = z.strictObject({
  engagementId: id, asOf: timestamp, balances: z.array(balance), entries: page(entry),
  coverageIncomplete: z.literal(true).optional(),
});
export const recordExternalPayment = z.strictObject({
  currency, amountMinor: positiveMinor, paidOn: localDate, reference: text.optional(),
});
export const externalPayment = recordExternalPayment.extend({
  id, engagementId: id, recordedBy: id, recordedAt: timestamp,
});
