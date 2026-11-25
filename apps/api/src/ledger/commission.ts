import type { AgreementVersion, LedgerEntry, Prisma, SaleEffect } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../http';
import { markForReview } from '../integrations/effects';
import { dueDate, eligibilityEnd } from './calendar';

type Posting = {
  effect: SaleEffect;
  agreement: AgreementVersion;
  basis: bigint;
  delta: bigint;
  dueOn: Date | null;
  kind: 'commission' | 'refund' | 'refund_reversal';
};

function round(basis: bigint, rate: number) {
  return (basis * BigInt(rate) + 5000n) / 10000n;
}

export async function recomputeClaim(tx: Prisma.TransactionClient, claimId: string, environment: string, actorId?: string) {
  const [locked] = await tx.$queryRaw<{ id: string }[]>`
    SELECT e.id FROM engagement e JOIN claim c ON c.engagement_id = e.id
    WHERE c.id = ${claimId}::uuid FOR UPDATE OF e
  `;
  if (!locked) return;
  const claim = await tx.claim.findUniqueOrThrow({ where: { id: claimId } });
  if (claim.status !== 'approved') throw new ApiError(409, 'CLAIM_UNAPPROVED', 'Approve the customer claim before assigning sales.');
  const matches = await tx.$queryRaw<{ id: string }[]>`
    SELECT s.id FROM sale_effect s
    JOIN connection c ON c.id = s.connection_id AND c.environment = ${environment}
    JOIN product_mapping m ON m.connection_id = s.connection_id AND m.external_product = s.external_product AND m.channel = s.channel
    JOIN source_authority a ON a.product_id = m.product_id AND a.channel = m.channel
      AND a.connection_id = c.id AND a.environment = c.environment
    JOIN customer_link l ON l.product_id = m.product_id AND l.connection_id = c.id AND l.external_customer = s.external_customer
    WHERE l.claim_id = ${claimId}::uuid AND s.disposition <> 'ineligible' AND s.kind = 'collection'
  `;
  const collections = await tx.saleEffect.findMany({
    where: { id: { in: matches.map(({ id }) => id) } },
    orderBy: [{ occurredAt: 'asc' }, { transactionKey: 'asc' }, { lineKey: 'asc' }, { id: 'asc' }],
  });
  const rules = await tx.agreementVersion.findMany({
    where: { engagementId: claim.engagementId, repAcceptedAt: { not: null } },
    orderBy: [{ effectiveAt: 'desc' }, { revision: 'desc' }],
  });
  const current = await tx.ledgerEntry.findMany({
    where: { claimId, environment, kind: { in: ['commission', 'refund', 'refund_reversal'] }, reversal: null },
  });
  const desired = new Map<string, Posting>();
  let first: Posting | undefined;
  for (const effect of collections) {
    if (effect.basisMinor === null) {
      await markForReview(tx, effect, 'BASIS_UNKNOWN');
      continue;
    }
    const previous = current.find((row) => row.effectId === effect.id && row.kind === 'commission');
    const agreement = rules.find((rule) => previous ? rule.id === previous.agreementId : rule.effectiveAt <= effect.occurredAt);
    if (!agreement) {
      await markForReview(tx, effect, 'TERMS_REQUIRED');
      continue;
    }
    if (first) {
      const { agreement: original, effect: firstSale } = first;
      const end = eligibilityEnd(firstSale.occurredAt, original.timeZone, original.eligibilityMonths);
      if (original.accrualMode === 'first_payment' || agreement.accrualMode === 'first_payment'
          || effect.occurredAt >= end) {
        await tx.saleEffect.update({ where: { id: effect.id }, data: { disposition: 'secondary' } });
        continue;
      }
    }
    const posting: Posting = {
      effect, agreement, basis: effect.basisMinor, delta: round(effect.basisMinor, agreement.rateBps),
      dueOn: dueDate(effect.occurredAt, agreement.timeZone, agreement.dueDay), kind: 'commission',
    };
    first ??= posting;
    desired.set(effect.id, posting);
    await buildRefunds(tx, posting, desired);
  }

  for (const row of current) {
    const posting = row.effectId ? desired.get(row.effectId) : undefined;
    if (posting && row.deltaMinor === posting.delta && row.basisMinor === posting.basis
      && row.agreementId === posting.agreement.id) {
      desired.delete(posting.effect.id);
      continue;
    }
    await reverseLedger(tx, row, 'Recalculated after source attribution or event ordering changed.', actorId);
  }
  for (const posting of desired.values()) {
    const { effect, agreement, basis, delta, dueOn, kind } = posting;
    await tx.ledgerEntry.create({ data: {
      companyId: claim.companyId, engagementId: claim.engagementId, environment,
      kind, postingKey: `effect:${effect.id}:${randomUUID()}`, currency: effect.currency,
      deltaMinor: delta, basisMinor: basis, effectiveAt: effect.occurredAt, dueOn,
      rateBps: agreement.rateBps, agreementId: agreement.id, claimId, effectId: effect.id, actorId,
    } });
    await tx.saleEffect.update({ where: { id: effect.id }, data: { disposition: 'posted' } });
    await tx.reviewItem.updateMany({
      where: { effectId: effect.id, resolvedAt: null }, data: { resolution: 'posted', resolvedAt: new Date(), resolvedBy: actorId },
    });
  }
}

async function buildRefunds(tx: Prisma.TransactionClient, original: Posting, desired: Map<string, Posting>) {
  const refunds = await tx.saleEffect.findMany({
    where: { originalEffectId: original.effect.id, kind: { in: ['refund', 'refund_reversal'] }, disposition: { not: 'ineligible' } },
    orderBy: [{ occurredAt: 'asc' }, { effectKey: 'asc' }],
  });
  let refundedAmount = 0n;
  let refundedBasis = 0n;
  for (const effect of refunds) {
    const reversing = effect.kind === 'refund_reversal';
    const nextAmount = refundedAmount + (reversing ? -effect.amountMinor : effect.amountMinor);
    if (nextAmount < 0n || nextAmount > original.effect.amountMinor) {
      await markForReview(tx, effect, 'REFUND_AMOUNT_UNKNOWN');
      continue;
    }
    const full = nextAmount === original.effect.amountMinor;
    const basis = effect.basisMinor ?? (full ? original.basis - refundedBasis
      : original.basis === original.effect.amountMinor ? effect.amountMinor : undefined);
    if (basis === undefined) {
      await markForReview(tx, effect, 'REFUND_BASIS_UNKNOWN');
      continue;
    }
    const nextBasis = refundedBasis + (reversing ? -basis : basis);
    if (nextBasis < 0n || nextBasis > original.basis) {
      await markForReview(tx, effect, 'REFUND_BASIS_UNKNOWN');
      continue;
    }
    const delta = round(refundedBasis, original.agreement.rateBps) - round(nextBasis, original.agreement.rateBps);
    refundedAmount = nextAmount;
    refundedBasis = nextBasis;
    desired.set(effect.id, { ...original, effect, basis, delta, kind: reversing ? 'refund_reversal' : 'refund' });
  }
}

export function reverseLedger(tx: Prisma.TransactionClient, row: LedgerEntry, reason: string, actorId?: string) {
  return tx.ledgerEntry.create({ data: {
    companyId: row.companyId, engagementId: row.engagementId, environment: row.environment,
    kind: 'reversal', postingKey: `reverse:${row.id}`, currency: row.currency,
    deltaMinor: -row.deltaMinor, reversesId: row.id, actorId, reason,
    effectiveAt: row.effectiveAt, dueOn: row.dueOn, paymentId: row.paymentId,
  } });
}
