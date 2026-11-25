import { Injectable } from '@nestjs/common';
import type { LedgerEntry, Prisma } from '@prisma/client';
import { balance, entry, statement, timestamp, type statementQuery } from '@repharbor/contracts';
import type { z } from 'zod';
import { readConfiguration } from '../config';
import { Database } from '../database';
import { requireEngagement, resourceNotFound, type Actor } from '../engagement/access';
import { decodeCursor, paginated } from '../engagement/storage';
import { ApiError } from '../http';
import { dateInZone } from './calendar';

const details = {
  effect: { include: { connection: { select: { provider: true } } } },
  claim: { select: { customerLabel: true } },
  payment: { select: { recordedBy: true, paidOn: true, reference: true } },
} satisfies Prisma.LedgerEntryInclude;

type EntryView = Prisma.LedgerEntryGetPayload<{ include: typeof details }>;

export function viewEntry(row: LedgerEntry | EntryView) {
  const effect = 'effect' in row ? row.effect : null;
  const claim = 'claim' in row ? row.claim : null;
  const payment = 'payment' in row ? row.payment : null;
  return entry.parse({
    id: row.id, engagementId: row.engagementId, kind: row.kind, currency: row.currency,
    deltaMinor: row.deltaMinor.toString(), effectiveAt: row.effectiveAt.toISOString(), postedAt: row.postedAt.toISOString(),
    dueOn: row.dueOn?.toISOString().slice(0, 10), basisMinor: row.basisMinor?.toString(),
    rateBps: row.rateBps ?? undefined, agreementId: row.agreementId ?? undefined,
    customerLabel: claim?.customerLabel, source: effect?.connection.provider,
    sourceTransactionRef: effect?.transactionKey, relatedEntryId: row.reversesId ?? undefined,
    paymentId: row.paymentId ?? undefined,
    paidOn: payment?.paidOn.toISOString().slice(0, 10), paymentReference: payment?.reference ?? undefined,
    recordedBy: payment?.recordedBy ?? (row.kind === 'external_payment' ? row.actorId ?? undefined : undefined),
    reason: row.reason ?? undefined,
  });
}

export function summarizeLedger(rows: EntryView[], cutoff: Date, zone: string) {
  const asOfDate = dateInZone(cutoff, zone).toString();
  const reversed = new Set(rows.map((row) => row.reversesId).filter(Boolean));
  const active = rows.filter((row) => row.kind !== 'reversal' && !reversed.has(row.id));
  const currencies = [...new Set(active.map((row) => row.currency))].sort();
  return currencies.map((currency) => {
    const items = active.filter((row) => row.currency === currency);
    const outstanding = items.reduce((sum, row) => sum + row.deltaMinor, 0n);
    let accrued = 0n;
    let paid = 0n;
    let credit = 0n;
    const accruals = new Map<string, { id: string; dueOn: string; net: bigint }>();
    const opening = items.some((row) => row.kind === 'opening');

    for (const row of items) {
      if (row.kind === 'external_payment') {
        paid -= row.deltaMinor;
        continue;
      }
      if (row.kind === 'opening' && row.deltaMinor < 0n) {
        credit -= row.deltaMinor;
        continue;
      }
      if (row.kind === 'commission' || row.kind === 'opening') {
        const dueOn = row.dueOn?.toISOString().slice(0, 10) ?? dateInZone(row.effectiveAt, zone).toString();
        accruals.set(row.effectId ?? row.id, { id: row.id, dueOn, net: row.deltaMinor });
        if (row.kind === 'commission') accrued += row.deltaMinor;
      }
    }
    for (const row of items) {
      if (!['refund', 'refund_reversal'].includes(row.kind)) continue;
      accrued += row.deltaMinor;
      const original = row.effect?.originalEffectId && accruals.get(row.effect.originalEffectId);
      if (original) original.net += row.deltaMinor;
      else credit -= row.deltaMinor;
    }
    let available = paid + credit;
    let due = 0n;
    const ordered = Array.from(accruals.values()).sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id));
    for (const amount of ordered) {
      if (amount.net <= 0n) continue;
      const applied = available > 0n ? (available < amount.net ? available : amount.net) : 0n;
      available -= applied;
      if (amount.dueOn <= asOfDate) due += amount.net - applied;
    }
    return balance.parse({
      currency, accruedMinor: accrued.toString(), recordedPaymentsMinor: paid.toString(),
      outstandingMinor: outstanding.toString(), dueMinor: due.toString(), openingStatus: opening ? 'known' : 'unknown',
    });
  });
}

@Injectable()
export class Statements {
  private readonly config = readConfiguration();
  private readonly environment = this.config.SALES_ENVIRONMENT;

  constructor(private readonly db: Database) {}

  async read(actor: Actor, engagementId: string, query: z.infer<typeof statementQuery>) {
    const { item } = await requireEngagement(this.db, actor, engagementId);
    const [embedded, token, extra] = query.cursor?.split('~') ?? [];
    const cursorDate = embedded && token && !extra ? timestamp.safeParse(embedded).data : undefined;
    if (query.cursor && (!cursorDate || (query.asOf && query.asOf !== cursorDate))) {
      throw new ApiError(400, 'INVALID_CURSOR', 'Start the statement again to refresh the snapshot.');
    }
    const cutoff = new Date(cursorDate || query.asOf || Date.now());
    const snapshot = cutoff.toISOString();
    const scope = `statement:${this.environment}:${actor.userId}:${engagementId}:${query.currency ?? '*'}:${snapshot}`;
    const cursor = decodeCursor(token, scope);
    const where = {
      engagementId, environment: this.environment, currency: query.currency, effectiveAt: { lte: cutoff }, postedAt: { lte: cutoff },
    } satisfies Prisma.LedgerEntryWhereInput;
    const interval = this.config.SALES_RECONCILIATION_INTERVAL_SECONDS;
    const oldestExpectedSync = new Date(Date.now() - (interval + 3_600) * 1_000);
    const [rows, totals, incompleteSource] = await this.db.$transaction([
      this.db.ledgerEntry.findMany({
        where, include: details,
        orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }],
        ...(cursor && { cursor: { id: cursor }, skip: 1 }), take: query.limit + 1,
      }),
      this.db.ledgerEntry.findMany({ where, include: details }),
      this.db.sourceAuthority.findFirst({
        where: {
          companyId: item.companyId, productId: item.productId, environment: this.environment,
          connection: { OR: [
            { status: { not: 'active' } },
            { gaps: { some: { resolvedAt: null, startsAt: { lte: cutoff } } } },
            ...(interval ? [{
              provider: { in: ['stripe', 'dodo', 'whop'] }, reconciledAt: { lt: oldestExpectedSync },
            }] : []),
          ] },
        },
        select: { productId: true },
      }),
    ], { isolationLevel: 'RepeatableRead' });
    const entries = paginated(rows, query.limit, scope, viewEntry);
    if (entries.nextCursor) entries.nextCursor = `${snapshot}~${entries.nextCursor}`;
    return statement.parse({
      engagementId, asOf: snapshot, balances: summarizeLedger(totals, cutoff, item.product.company.timeZone), entries,
      ...(incompleteSource && { coverageIncomplete: true }),
    });
  }

  async entry(actor: Actor, engagementId: string, entryId: string) {
    await requireEngagement(this.db, actor, engagementId);
    const row = await this.db.ledgerEntry.findFirst({
      where: { id: entryId, engagementId, environment: this.environment }, include: details,
    });
    if (!row) throw resourceNotFound();
    const result = viewEntry(row);
    if (row.effect?.originalEffectId) {
      const original = await this.db.ledgerEntry.findFirst({
        where: { engagementId, environment: this.environment, effectId: row.effect.originalEffectId, kind: 'commission' },
        orderBy: { postedAt: 'desc' },
      });
      if (original) result.relatedEntryId = original.id;
    }
    return result;
  }
}

export async function engagementBalances(
  tx: Prisma.TransactionClient, engagementId: string, environment: string, cutoff: Date, zone: string,
) {
  const data = await tx.ledgerEntry.findMany({
    where: { engagementId, environment, effectiveAt: { lte: cutoff }, postedAt: { lte: cutoff } },
    include: details,
  });
  return summarizeLedger(data, cutoff, zone);
}
