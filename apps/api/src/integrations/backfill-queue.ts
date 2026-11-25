import type { Prisma } from '@prisma/client';
import { backfillInput } from '@repharbor/contracts';
import type { z } from 'zod';
import type { Database } from '../database';
import type { Environment } from './provider';
import type { Providers } from './providers';

const hour = 3_600_000;
export const maxBackfillWindow = 366 * 24 * hour;

export function activeBackfill(tx: Prisma.TransactionClient, connectionId: string) {
  return tx.job.findFirst({ where: {
    kind: 'provider_backfill', state: { in: ['ready', 'leased'] }, args: { path: ['connectionId'], equals: connectionId },
  }, select: { id: true } });
}

export function queueBackfill(
  tx: Prisma.TransactionClient, connectionId: string, key: string, window: z.infer<typeof backfillInput>,
) {
  return tx.job.create({
    data: { kind: 'provider_backfill', dedupeKey: `backfill:${connectionId}:${key}`, state: 'ready', args: { ...window, connectionId } },
  });
}

export async function queueScheduledBackfills(
  db: Database, providers: Providers, environment: Environment, interval: number, now: Date,
) {
  await db.$transaction(async (tx) => {
    const due = await tx.$queryRaw<{ id: string; coverageFrom: Date; reconciledThrough: Date }[]>`
      SELECT c.id, c.coverage_from AS "coverageFrom", c.reconciled_through AS "reconciledThrough" FROM connection c
      WHERE c.environment = ${environment} AND c.provider IN ('stripe', 'dodo', 'whop')
        AND c.status <> 'disconnected'
        AND c.coverage_from IS NOT NULL AND c.reconciled_through IS NOT NULL
        AND (c.next_reconciliation_at IS NULL OR c.next_reconciliation_at <= ${now})
        AND NOT EXISTS (
          SELECT 1 FROM job WHERE kind = 'provider_backfill' AND state IN ('ready', 'leased')
            AND args->>'connectionId' = c.id::text
        )
      ORDER BY c.next_reconciliation_at NULLS FIRST, c.id
      LIMIT 10 FOR UPDATE OF c SKIP LOCKED
    `;
    for (const { id, coverageFrom, reconciledThrough } of due) {
      if (await activeBackfill(tx, id)) continue;
      const connection = await tx.connection.update({
        where: { id }, data: { nextReconciliationAt: new Date(now.getTime() + interval) },
      });
      if (!providers.source(connection).credentials.apiKey) continue;
      // Overlap successive windows so recently visible records can be picked up again.
      const end = now.getTime();
      const start = Math.max(
        end - maxBackfillWindow,
        coverageFrom.getTime(),
        reconciledThrough.getTime() - Math.min(hour, interval),
      );
      if (start >= end) continue;
      await queueBackfill(tx, id, `scheduled:${now.toISOString()}`, {
        start: new Date(start).toISOString(), end: now.toISOString(),
      });
    }
  });
}
