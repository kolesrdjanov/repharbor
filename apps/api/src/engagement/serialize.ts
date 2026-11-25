import type { AgreementVersion, Claim, Engagement, Invitation } from '@prisma/client';
import { agreement, claim, engagement, invitation } from '@repharbor/contracts';

export function viewEngagement(row: Engagement) {
  return engagement.parse({
    id: row.id, companyId: row.companyId, productId: row.productId, repId: row.repId ?? undefined,
    status: row.closedAt ? 'closed' : row.repId ? 'active' : 'invited',
  });
}

export function viewAgreement(row: AgreementVersion) {
  const {
    id, engagementId, revision, rateBps, basis, accrualMode, eligibilityMonths,
    refundPolicy, cadence, dueDay, timeZone, founderAcceptedAt, repAcceptedAt, effectiveAt,
  } = row;
  return agreement.parse({
    id, engagementId, revision, rateBps, basis, accrualMode, eligibilityMonths, refundPolicy, cadence, dueDay, timeZone,
    effectiveAt: effectiveAt.toISOString(),
    founderAcceptedAt: founderAcceptedAt.toISOString(),
    repAcceptedAt: repAcceptedAt?.toISOString(),
  });
}

export function viewInvitation(row: Invitation) {
  return invitation.parse({
    id: row.id, direction: row.direction, expiresAt: row.expiresAt.toISOString(), engagementId: row.engagementId ?? undefined,
    status: row.acceptedAt ? 'accepted' : row.revokedAt ? 'revoked' : row.expiresAt <= new Date() ? 'expired' : 'pending',
  });
}

export function viewClaim(row: Claim, competingClaimCount?: number) {
  return claim.parse({
    id: row.id, engagementId: row.engagementId, customerLabel: row.customerLabel, status: row.status,
    contactEmail: row.contactEmail ?? undefined, reason: row.reason ?? undefined, competingClaimCount,
  });
}
