import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { Connection, Prisma } from '@prisma/client';
import { z } from 'zod';
import { Database } from '../database';
import { classifyEffect } from './effects';
import { validateSource } from './inbox';
import { envelope, normalizedEffect, type Effect } from './provider';
import { Providers } from './providers';

type Lease = { id: string; args: unknown; attempts: number; leaseToken: string };
const args = z.strictObject({ eventId: z.uuid() });

@Injectable()
export class IngestionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestionWorker.name);
  private readonly stop = new AbortController();
  private loop: Promise<void> | undefined;

  constructor(private readonly db: Database, private readonly providers: Providers) {}

  onModuleInit() {
    this.loop = this.process();
  }

  async onModuleDestroy() {
    this.stop.abort();
    await this.loop;
  }

  private async lease() {
    const [job] = await this.db.$queryRaw<Lease[]>`
      WITH head AS (
        SELECT id FROM job WHERE kind = 'normalize_sale' AND (
          (state = 'ready' AND run_after <= now()) OR (state = 'leased' AND lease_until <= now())
        ) ORDER BY run_after, id FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE job SET state = 'leased', lease_token = ${randomUUID()}::uuid,
        lease_until = now() + interval '90 seconds', attempts = attempts + 1
      FROM head WHERE job.id = head.id
      RETURNING job.id, job.args, job.attempts, job.lease_token AS "leaseToken"
    `;
    return job;
  }

  private async postEffect(tx: Prisma.TransactionClient, source: Connection, sourceEventId: string, effect: Effect) {
    const { reviewReason, ...values } = effect;
    const rows = await tx.saleEffect.createManyAndReturn({
      data: {
        ...values, companyId: source.companyId, connectionId: source.id, sourceEventId, disposition: 'pending',
        amountMinor: BigInt(effect.amountMinor),
        basisMinor: effect.basisMinor === undefined ? null : BigInt(effect.basisMinor),
      },
      skipDuplicates: true,
    });
    const [created] = rows;
    if (!created) return;
    await classifyEffect(tx, created, reviewReason);
    if (created.kind === 'collection' && created.originalExternalKey) {
      const waiting = await tx.saleEffect.findMany({ where: {
        connectionId: source.id, disposition: 'pending', originalEffectId: null, kind: { not: 'collection' },
        originalExternalKey: created.originalExternalKey,
      } });
      for (const item of waiting) await classifyEffect(tx, item);
    }
  }

  private async run(job: Lease) {
    const { eventId } = args.parse(job.args);
    const record = await this.db.inboundEvent.findUniqueOrThrow({
      where: { id: eventId }, include: { connection: true },
    });
    const event = envelope.parse(record.payload);
    validateSource(record.connection, event);
    const source = this.providers.source(record.connection);
    const effects = normalizedEffect.array().parse(await this.providers.forProvider(source.provider).normalize(event, source));
    await this.db.$transaction(async (tx) => {
      // Acquire the connection first so jobs and founder-side mapping work share an ordering boundary.
      await tx.$queryRaw`SELECT id FROM company WHERE id = ${record.connection.companyId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM connection WHERE id = ${source.id}::uuid FOR UPDATE`;
      const lease = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM job WHERE id = ${job.id}::uuid AND state = 'leased'
          AND lease_token = ${job.leaseToken}::uuid AND lease_until > now() FOR UPDATE
      `;
      if (!lease.length) return;
      for (const item of effects) await this.postEffect(tx, record.connection, record.id, item);
      await tx.job.update({
        where: { id: job.id },
        data: { state: 'done', leaseUntil: null, leaseToken: null, lastErrorCode: null },
      });
    }, { timeout: 30_000 });
  }

  private async retry(job: Lease) {
    const state = job.attempts >= 6 ? 'failed' : 'ready';
    await this.db.job.updateMany({
      where: { id: job.id, leaseToken: job.leaseToken, state: 'leased' },
      data: {
        state, leaseUntil: null, leaseToken: null, lastErrorCode: 'NORMALIZATION_FAILED',
        runAfter: new Date(Date.now() + 2_000 * 2 ** job.attempts),
      },
    });
    if (state === 'failed') this.logger.error(`Sales normalization job ${job.id} exhausted retries.`);
  }

  private async process() {
    while (!this.stop.signal.aborted) {
      try {
        const job = await this.lease();
        if (job) {
          await this.run(job).catch(() => this.retry(job));
          continue;
        }
      } catch {
        this.logger.warn('Sales ingestion queue is temporarily unavailable.');
      }
      await delay(1_000, undefined, { signal: this.stop.signal }).catch(() => undefined);
    }
  }
}
