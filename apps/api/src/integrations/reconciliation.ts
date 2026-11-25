import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { Connection, Prisma } from '@prisma/client';
import { backfillInput, coverageGap, id, type pagination } from '@repharbor/contracts';
import { z } from 'zod';
import { readConfiguration } from '../config';
import { Database } from '../database';
import { ApiError } from '../http';
import type { Actor } from '../engagement/access';
import { audit, decodeCursor, idempotent, paginated } from '../engagement/storage';
import { activeBackfill, maxBackfillWindow, queueBackfill, queueScheduledBackfills } from './backfill-queue';
import { requireConnection } from './connections';
import { enqueueEvent } from './inbox';
import { envelope } from './provider';
import { Providers } from './providers';

const requested = z.strictObject({ jobId: id });
const jobArgs = backfillInput.extend({
  connectionId: id, cursor: z.string().optional(), waiting: z.boolean().optional(), unavailableBefore: z.iso.datetime().optional(),
});
type JobArgs = z.infer<typeof jobArgs>;
type Lease = { id: string; args: Prisma.JsonValue; leaseToken: string; attempts: number };

@Injectable()
export class Reconciliation {
  constructor(private readonly db: Database) {}

  async coverage(actor: Actor, companyId: string, connectionId: string, query: z.infer<typeof pagination>) {
    await requireConnection(this.db, actor, companyId, connectionId);
    const scope = `coverage:${actor.userId}:${companyId}:${connectionId}`;
    const cursor = decodeCursor(query.cursor, scope);
    const rows = await this.db.coverageGap.findMany({
      where: { connectionId, ...(cursor && { id: { gt: cursor } }) },
      orderBy: { id: 'asc' }, take: query.limit + 1,
    });
    return paginated(rows, query.limit, scope, (item) => coverageGap.parse({
      id: item.id, reason: item.reason, startsAt: item.startsAt.toISOString(),
      endsAt: item.endsAt?.toISOString(), resolvedAt: item.resolvedAt?.toISOString(),
    }));
  }

  request(actor: Actor, companyId: string, connectionId: string, key: string, input: z.infer<typeof backfillInput>) {
    const start = new Date(input.start);
    const end = new Date(input.end);
    if (start >= end || end > new Date() || end.getTime() - start.getTime() > maxBackfillWindow) {
      throw new ApiError(422, 'INVALID_WINDOW', 'Choose a past range up to one year.');
    }
    return this.db.$transaction(async (tx) => {
      await requireConnection(tx, actor, companyId, connectionId);
      const [connection] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM connection WHERE id = ${connectionId}::uuid FOR UPDATE
      `;
      return idempotent(tx, actor, `backfill:${companyId}:${connectionId}`, key, input, 202, requested, async () => {
        if (connection.status === 'disconnected') throw new ApiError(409, 'CONNECTION_DISCONNECTED', 'Reconnect the source first.');
        if (await activeBackfill(tx, connectionId)) {
          throw new ApiError(409, 'BACKFILL_IN_PROGRESS', 'A history import is already in progress for this connection.');
        }
        const job = await queueBackfill(tx, connectionId, key, input);
        await audit(tx, actor, companyId, 'connection', connectionId, 'request_backfill', { jobId: job.id, ...input });
        return { jobId: job.id };
      });
    });
  }
}

@Injectable()
export class ReconciliationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly stop = new AbortController();
  private readonly logger = new Logger(ReconciliationWorker.name);
  private readonly config = readConfiguration();
  private readonly interval = this.config.SALES_RECONCILIATION_INTERVAL_SECONDS * 1_000;
  private nextScheduleCheck = 0;
  private loop?: Promise<void>;

  constructor(private readonly db: Database, private readonly providers: Providers) {}

  onModuleInit() { this.loop = this.process(); }
  async onModuleDestroy() { this.stop.abort(); await this.loop; }

  private async lease() {
    const [job] = await this.db.$queryRaw<Lease[]>`
      WITH head AS (
        SELECT id FROM job WHERE kind = 'provider_backfill' AND (
          (state = 'ready' AND run_after <= now()) OR (state = 'leased' AND lease_until <= now())
        ) ORDER BY run_after, id FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE job SET state = 'leased', lease_token = ${randomUUID()}::uuid, lease_until = now() + interval '90 seconds'
      FROM head WHERE job.id = head.id
      RETURNING job.id, job.args, job.attempts, job.lease_token AS "leaseToken"
    `;
    return job;
  }

  private async release(tx: Prisma.TransactionClient, job: Lease, state: string, args: JobArgs, code?: string, wait = 0) {
    await tx.job.updateMany({
      where: { id: job.id, state: 'leased', leaseToken: job.leaseToken },
      data: { state, args, lastErrorCode: code ?? null, leaseUntil: null, leaseToken: null,
        runAfter: new Date(Date.now() + wait), attempts: code ? job.attempts + 1 : 0 },
    });
  }

  private async run(job: Lease) {
    const args = jobArgs.parse(job.args);
    const connection = await this.db.connection.findUniqueOrThrow({ where: { id: args.connectionId } });
    const start = new Date(args.start);
    const end = new Date(args.end);
    const source = this.providers.source(connection);
    const page = !args.waiting && connection.status !== 'disconnected'
      ? await this.providers.forProvider(source.provider).importPage(source, { start, end }, args.cursor)
      : undefined;
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM connection WHERE id = ${source.id}::uuid FOR UPDATE`;
      const current = await tx.connection.findUniqueOrThrow({ where: { id: source.id } });
      const lease = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM job WHERE id = ${job.id}::uuid AND state = 'leased'
          AND lease_token = ${job.leaseToken}::uuid AND lease_until > now() FOR UPDATE
      `;
      if (!lease.length) return;
      if (current.status === 'disconnected' || current.secretRef !== connection.secretRef) {
        return this.release(tx, job, 'failed', args, 'SOURCE_CHANGED');
      }
      if (page) {
        for (const event of page.events) await enqueueEvent(tx, current, envelope.parse(event));
        const next = {
          ...args, cursor: page.nextCursor, waiting: !page.nextCursor,
          unavailableBefore: args.unavailableBefore ?? page.unavailableBefore?.toISOString(),
        };
        await tx.connection.update({ where: { id: source.id }, data: { importCursor: page.nextCursor ?? null } });
        return this.release(tx, job, 'ready', next);
      }
      const jobs = await tx.$queryRaw<{ state: string; count: bigint }[]>`
        SELECT j.state, count(*) FROM job j JOIN inbound_event e ON j.dedupe_key = 'normalize-sale:' || e.id::text
        WHERE e.connection_id = ${current.id}::uuid
          AND (e.payload->>'occurredAt')::timestamptz >= ${start} AND (e.payload->>'occurredAt')::timestamptz < ${end}
          AND j.state <> 'done'
        GROUP BY j.state
      `;
      if (jobs.some((item) => item.state === 'ready' || item.state === 'leased')) return this.release(tx, job, 'ready', args, undefined, 2_000);
      if (jobs.some((item) => item.state === 'failed')) return this.finishGap(tx, job, args, current, start, end, 'NORMALIZATION_FAILED');
      const available = args.unavailableBefore ? new Date(Math.min(Date.parse(args.unavailableBefore), end.getTime())) : start;
      if (available > start) {
        // A provider's current retention limit does not invalidate an earlier successful import.
        const { coverageFrom: priorStart, reconciledThrough: priorEnd } = current;
        if (priorStart && priorEnd && priorEnd > priorStart) {
          await this.recordGap(tx, current.id, start, new Date(Math.min(+available, +priorStart)), 'HISTORY_UNAVAILABLE');
          await this.recordGap(tx, current.id, new Date(Math.max(+start, +priorEnd)), available, 'HISTORY_UNAVAILABLE');
        } else {
          await this.recordGap(tx, current.id, start, available, 'HISTORY_UNAVAILABLE');
        }
      }
      if (available < end) {
        await this.closeCoveredGaps(tx, current.id, available, end);
        if (current.coverageFrom && end < current.coverageFrom) {
          await this.recordGap(tx, current.id, end, current.coverageFrom, 'HISTORY_NOT_RECONCILED');
        }
        if (current.reconciledThrough && current.reconciledThrough < start) {
          await this.recordGap(tx, current.id, current.reconciledThrough, start, 'HISTORY_NOT_RECONCILED');
        }
      }
      const hasGap = await tx.coverageGap.findFirst({ where: { connectionId: current.id, resolvedAt: null }, select: { id: true } });
      await tx.connection.update({ where: { id: current.id }, data: {
        ...(available < end && {
          coverageFrom: current.coverageFrom && current.coverageFrom < available ? current.coverageFrom : available,
          reconciledThrough: current.reconciledThrough && current.reconciledThrough > end ? current.reconciledThrough : end,
          reconciledAt: new Date(),
        }),
        status: hasGap ? 'degraded' : 'active',
      } });
      await this.release(tx, job, 'done', args);
    }, { timeout: 30_000 });
  }

  private async closeCoveredGaps(tx: Prisma.TransactionClient, connectionId: string, start: Date, end: Date) {
    const overlaps = await tx.coverageGap.findMany({ where: {
      connectionId, resolvedAt: null, startsAt: { lt: end }, OR: [{ endsAt: null }, { endsAt: { gt: start } }],
    } });
    for (const gap of overlaps) {
      await tx.coverageGap.update({ where: { id: gap.id }, data: { resolvedAt: new Date() } });
      await this.recordGap(tx, connectionId, gap.startsAt, start, gap.reason);
      if (!gap.endsAt || gap.endsAt > end) await this.recordGap(tx, connectionId, end, gap.endsAt, gap.reason);
    }
  }

  private async recordGap(tx: Prisma.TransactionClient, connectionId: string, startsAt: Date, endsAt: Date | null, reason: string) {
    if (endsAt && startsAt >= endsAt) return;
    const where = { connectionId, startsAt, endsAt, reason, resolvedAt: null };
    if (!await tx.coverageGap.findFirst({ where })) await tx.coverageGap.create({ data: where });
  }

  private async finishGap(tx: Prisma.TransactionClient, job: Lease, args: JobArgs, source: Connection, start: Date, end: Date, code: string) {
    await this.recordGap(tx, source.id, start, end, code);
    await tx.connection.updateMany({ where: { id: source.id, status: { not: 'disconnected' } }, data: { status: 'degraded' } });
    await this.release(tx, job, 'failed', args, code);
  }

  private async process() {
    while (!this.stop.signal.aborted) {
      try {
        const now = new Date();
        if (this.interval && now.getTime() >= this.nextScheduleCheck) {
          this.nextScheduleCheck = now.getTime() + Math.min(60_000, this.interval);
          await queueScheduledBackfills(this.db, this.providers, this.config.SALES_ENVIRONMENT, this.interval, now);
        }
        const job = await this.lease();
        if (job) {
          await this.run(job).catch(async () => {
            const args = jobArgs.parse(job.args);
            const code = 'IMPORT_FAILED';
            if (job.attempts < 5) await this.release(this.db, job, 'ready', args, code, 2_000 * 2 ** job.attempts);
            else {
              this.logger.error(`Backfill job ${job.id} exhausted retries.`);
              await this.db.$transaction(async (tx) => {
                await tx.$queryRaw`SELECT id FROM connection WHERE id = ${args.connectionId}::uuid FOR UPDATE`;
                const source = await tx.connection.findUniqueOrThrow({ where: { id: args.connectionId } });
                const lease = await tx.job.findFirst({ where: { id: job.id, leaseToken: job.leaseToken, leaseUntil: { gt: new Date() } } });
                if (!lease) return;
                if (source.status === 'disconnected') return this.release(tx, job, 'failed', args, 'SOURCE_CHANGED');
                await this.finishGap(tx, job, args, source, new Date(args.start), new Date(args.end), code);
              });
            }
          });
          continue;
        }
      } catch {
        this.logger.warn('Reconciliation queue is temporarily unavailable.');
      }
      await delay(1_000, undefined, { signal: this.stop.signal }).catch(() => undefined);
    }
  }
}
