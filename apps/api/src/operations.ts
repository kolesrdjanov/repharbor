import { z } from 'zod';
import { readConfiguration } from './config';
import { Database } from './database';

async function status(db: Database) {
  const [jobs, coverage] = await Promise.all([
    db.$queryRaw<{ kind: string; state: string; count: number; oldestReadySeconds: number | null }[]>`
      SELECT kind, state, count(*)::int AS count,
        CASE WHEN state = 'ready' THEN floor(extract(epoch from (now() - min(run_after))))::int ELSE NULL END AS "oldestReadySeconds"
      FROM job GROUP BY kind,state ORDER BY kind,state
    `,
    db.coverageGap.count({ where: { resolvedAt: null } }),
  ]);
  console.log(JSON.stringify({ database: await db.isReady() ? 'ok' : 'unavailable', jobs, openCoverageGaps: coverage }, null, 2));
}

async function replay(db: Database, rawConnection: string | undefined, rawJob: string | undefined, rawReason: string | undefined) {
  const connectionId = z.uuid().parse(rawConnection);
  const jobId = z.uuid().parse(rawJob);
  const reason = z.string().trim().min(1).max(500).parse(rawReason);
  await db.$transaction(async (tx) => {
    const connection = await tx.connection.findUniqueOrThrow({ where: { id: connectionId }, select: { companyId: true } });
    const affected = await tx.$executeRaw`
      UPDATE job j SET state = 'ready', run_after = now(), attempts = 0, lease_token = NULL, lease_until = NULL, last_error_code = NULL
      FROM inbound_event e WHERE j.id = ${jobId}::uuid AND j.kind = 'normalize_sale' AND j.state = 'failed'
        AND e.connection_id = ${connectionId}::uuid AND j.dedupe_key = 'normalize-sale:' || e.id::text
    `;
    if (!affected) throw new Error('No failed normalization job matched this connection.');
    await tx.auditEvent.create({ data: {
      companyId: connection.companyId, subjectType: 'job', subjectId: jobId,
      action: 'operator_replay', details: { connectionId, reason },
    } });
  });
  console.log(JSON.stringify({ connectionId, jobId, state: 'ready' }));
}

async function main() {
  const [, , command, connection, job, reason] = process.argv;
  if (command !== 'status' && command !== 'replay') {
    throw new Error('Use status or replay <connection-id> <failed-normalization-job-id> <reason>.');
  }
  readConfiguration();
  const db = new Database();
  try {
    await db.$connect();
    if (command === 'status') await status(db);
    else await replay(db, connection, job, reason);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error && error.constructor === Error ? error.message : 'Operations command failed.');
  process.exitCode = 1;
});
