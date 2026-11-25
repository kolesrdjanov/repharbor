import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { id } from '@repharbor/contracts';
import type { z } from 'zod';
import { readConfiguration } from '../config';
import { ApiError } from '../http';
import type { Actor } from './access';

export async function idempotent<T extends Prisma.InputJsonObject>(
  tx: Prisma.TransactionClient, actor: Actor, scope: string, key: string, body: unknown, status: number,
  decode: z.ZodType<T>, execute: () => Promise<T>,
) {
  const compoundKey = { actorId: actor.userId, scope, key };
  const lockKey = JSON.stringify(compoundKey);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  const requestHash = createHash('sha256').update(JSON.stringify(body)).digest();
  const previous = await tx.idempotencyRecord.findUnique({ where: { actorId_scope_key: compoundKey } });
  if (previous) {
    if (!requestHash.equals(previous.requestHash)) {
      throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This request key was already used for a different submission.');
    }
    return decode.parse(previous.responseBody);
  }
  const outcome = await execute();
  const responseBody = JSON.parse(JSON.stringify(outcome)) as Prisma.InputJsonObject;
  await tx.idempotencyRecord.create({ data: { ...compoundKey, requestHash, responseCode: status, responseBody } });
  return outcome;
}

export function audit(
  tx: Prisma.TransactionClient, actor: Actor, companyId: string | null, subjectType: string, subjectId: string,
  action: string, details: Prisma.InputJsonObject = {},
) {
  return tx.auditEvent.create({ data: { actorId: actor.userId, companyId, subjectType, subjectId, action, details } });
}

function sign(value: string) {
  const key = Buffer.from(readConfiguration().SECRET_ENCRYPTION_KEY, 'base64');
  return createHmac('sha256', key).update(value).digest();
}

export function decodeCursor(cursor: string | undefined, scope: string) {
  if (!cursor) return undefined;
  const [value, signature, extra] = cursor.split('.');
  const invalid = () => new ApiError(400, 'INVALID_CURSOR', 'Start the list again to refresh the page.');
  if (!value || !signature || extra !== undefined || cursor.length > 200) throw invalid();
  const decoded = Buffer.from(value, 'base64url').toString('utf8');
  const submitted = Buffer.from(signature, 'base64url');
  const expected = sign(`${scope}:${decoded}`);
  const parsed = id.safeParse(decoded);
  if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected) || !parsed.success) throw invalid();
  return parsed.data;
}

export function paginated<Row extends { id: string }, Output>(
  rows: Row[], limit: number, scope: string, serialize: (row: Row) => Output,
) {
  const items = rows.slice(0, limit);
  const lastId = items.at(-1)?.id;
  const nextCursor = rows.length > limit && lastId
    ? `${Buffer.from(lastId).toString('base64url')}.${sign(`${scope}:${lastId}`).toString('base64url')}`
    : undefined;
  return { items: items.map(serialize), ...(nextCursor && { nextCursor }) };
}
