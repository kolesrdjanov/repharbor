import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { readConfiguration } from './config';
import { Database } from './database';
import { maxBackfillWindow } from './integrations/backfill-queue';

async function status(db: Database, rawMaxAge?: string) {
  const maxAge = rawMaxAge === undefined ? undefined : z.coerce.number().int().positive().parse(rawMaxAge);
  const [jobs, coverage] = await Promise.all([
    db.$queryRaw<{ kind: string; state: string; count: number; oldestReadySeconds: number | null; oldestExpiredLeaseSeconds: number | null }[]>`
      SELECT kind, state, count(*)::int AS count,
        CASE WHEN state = 'ready' THEN GREATEST(0, floor(extract(epoch from (now() - min(run_after)))))::int END AS "oldestReadySeconds",
        CASE WHEN state = 'leased' THEN GREATEST(0, floor(extract(epoch from (now() - min(lease_until)))))::int END AS "oldestExpiredLeaseSeconds"
      FROM job j
      WHERE NOT ${maxAge !== undefined} OR j.kind <> 'provider_backfill' OR j.state <> 'failed' OR EXISTS (
        SELECT 1 FROM coverage_gap g WHERE g.connection_id::text = j.args->>'connectionId'
          AND g.reason = j.last_error_code AND g.resolved_at IS NULL
          AND g.starts_at < (j.args->>'end')::timestamptz
          AND (g.ends_at IS NULL OR g.ends_at > (j.args->>'start')::timestamptz)
      )
      GROUP BY kind,state ORDER BY kind,state
    `,
    db.coverageGap.count({ where: { resolvedAt: null } }),
  ]);
  const ready = await db.isReady();
  const issues = maxAge === undefined ? undefined : jobs.filter(({ kind, state, oldestReadySeconds, oldestExpiredLeaseSeconds }) =>
    (kind === 'normalize_sale' || kind === 'provider_backfill')
      && (state === 'failed' || Math.max(oldestReadySeconds ?? 0, oldestExpiredLeaseSeconds ?? 0) >= maxAge),
  );
  console.log(JSON.stringify({ database: ready ? 'ok' : 'unavailable', jobs, openCoverageGaps: coverage, issues }, null, 2));
  if (issues && (!ready || issues.length)) process.exitCode = 1;
}

async function replay(db: Database, connectionId: string, selection: Prisma.Sql, rawReason: string | undefined) {
  const reason = z.string().trim().min(1).max(500).parse(rawReason);
  const count = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM connection WHERE id = ${connectionId}::uuid FOR UPDATE`;
    const connection = await tx.connection.findUniqueOrThrow({ where: { id: connectionId }, select: { companyId: true } });
    const affected = await tx.$queryRaw<{ id: string }[]>`
      UPDATE job j SET state = 'ready', run_after = now(), attempts = 0, lease_token = NULL, lease_until = NULL, last_error_code = NULL
      FROM inbound_event e WHERE j.kind = 'normalize_sale' AND j.state = 'failed'
        AND e.connection_id = ${connectionId}::uuid AND j.dedupe_key = 'normalize-sale:' || e.id::text
        AND ${selection}
      RETURNING j.id
    `;
    if (!affected.length) throw new Error('No failed normalization job matched this connection and selection.');
    await tx.auditEvent.createMany({ data: affected.map(({ id }) => ({
      companyId: connection.companyId, subjectType: 'job', subjectId: id,
      action: 'operator_replay', details: { connectionId, reason },
    })) });
    return affected.length;
  });
  return count;
}

function replayWindow(rawStart: string | undefined, rawEnd: string | undefined) {
  const timestamp = z.iso.datetime({ offset: true });
  const start = new Date(timestamp.parse(rawStart));
  const end = new Date(timestamp.parse(rawEnd));
  if (start >= end || +end - +start > maxBackfillWindow) throw new Error('Use a date range up to one year.');
  return Prisma.sql`(e.payload->>'occurredAt')::timestamptz >= ${start} AND (e.payload->>'occurredAt')::timestamptz < ${end}`;
}

async function main() {
  const [, , command, first, second, third, fourth] = process.argv;
  if (!['status', 'check-sales', 'replay', 'replay-range'].includes(command)) {
    throw new Error('Use status, check-sales [max-queue-age-seconds], replay <connection-id> <job-id> <reason>, or replay-range <connection-id> <start> <end> <reason>.');
  }
  readConfiguration();
  const db = new Database();
  try {
    await db.$connect();
    if (command === 'status') await status(db);
    if (command === 'check-sales') await status(db, first ?? '900');
    if (command === 'replay') {
      const connectionId = z.uuid().parse(first);
      const jobId = z.uuid().parse(second);
      await replay(db, connectionId, Prisma.sql`j.id = ${jobId}::uuid`, third);
      console.log(JSON.stringify({ connectionId, jobId, state: 'ready' }));
    }
    if (command === 'replay-range') {
      const connectionId = z.uuid().parse(first);
      const requeued = await replay(db, connectionId, replayWindow(second, third), fourth);
      console.log(JSON.stringify({ connectionId, requeued }));
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error && error.constructor === Error ? error.message : 'Operations command failed.');
  process.exitCode = 1;
});
