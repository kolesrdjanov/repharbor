import { z } from 'zod';
import { agreement, balance, email, engagement, id, localDate, page, terms, timeZone, timestamp } from './base';

const name = z.string().trim().min(1).max(200);
const normalizedEmail = z.string().trim().toLowerCase().pipe(email);
const opaque = z.string().min(1).max(2048);
const revision = z.number().int().nonnegative();

export const createCompany = z.strictObject({ name, timeZone });
export const createProduct = z.strictObject({ name });
export const inviteFounder = z.strictObject({ email: normalizedEmail });
export const inviteRep = inviteFounder.extend({ productId: id, terms });
export const invitationReference = z.union([z.strictObject({ token: opaque }), z.strictObject({ invitationId: id })]);
export const acceptInvitation = z.union([
  z.strictObject({ token: opaque, companyId: id.optional(), productId: id.optional() }),
  z.strictObject({ invitationId: id, companyId: id.optional(), productId: id.optional() }),
]);
export const invitation = z.strictObject({
  id, direction: z.enum(['invite_rep', 'invite_founder']), expiresAt: timestamp,
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']), engagementId: id.optional(),
});
export const invitationPreview = z.strictObject({
  invitation, companyName: name.optional(), productName: name.optional(), terms: agreement.optional(),
});
export const engagementContext = z.strictObject({ engagement, viewerRole: z.enum(['founder', 'rep']) });
export const engagementSummary = z.strictObject({
  engagement, companyName: name, productName: name, repEmail: email.optional(),
  nextDueOn: localDate.optional(), balances: z.array(balance),
});
export const engagementPage = page(engagementSummary);
export const proposeAgreement = z.strictObject({ previousRevision: revision, terms });
export const acceptAgreement = z.strictObject({ revision });
export const registerClaim = z.strictObject({ customerLabel: name, contactEmail: normalizedEmail.optional() });
export const decideClaim = z.discriminatedUnion('decision', [
  z.strictObject({ decision: z.literal('approved') }),
  z.strictObject({ decision: z.literal('declined'), reason: z.string().trim().min(1).max(1000) }),
]);
