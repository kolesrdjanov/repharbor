import { Injectable } from '@nestjs/common';
import { Prisma, type Connection } from '@prisma/client';
import { Database } from '../database';
import { ApiError } from '../http';
import type { DeliveryHeaders, Envelope, Provider } from './provider';
import { Providers } from './providers';

export function validateSource(connection: Connection, event: Envelope) {
  if (event.environment !== connection.environment || event.account !== connection.externalAccount) {
    throw new ApiError(403, 'SOURCE_MISMATCH', 'The authenticated delivery does not match the source configuration.');
  }
}

export async function enqueueEvent(tx: Prisma.TransactionClient, connection: Connection, event: Envelope) {
  validateSource(connection, event);
  const ids = await tx.inboundEvent.createManyAndReturn({
    data: { connectionId: connection.id, externalEvent: event.eventId, payload: event },
    skipDuplicates: true, select: { id: true },
  });
  if (!ids.length) return;
  const id = ids[0].id;
  await tx.job.create({ data: {
    kind: 'normalize_sale', dedupeKey: `normalize-sale:${id}`, state: 'ready', args: { eventId: id },
  } });
}

@Injectable()
export class Inbox {
  constructor(private readonly db: Database, private readonly providers: Providers) {}

  async receive(provider: Provider, id: string, body: Buffer, headers: DeliveryHeaders) {
    const failed = () => new ApiError(401, 'WEBHOOK_AUTH_FAILED', 'Delivery authentication failed.');
    const row = await this.db.connection.findFirst({ where: { id, provider, status: { not: 'disconnected' } } });
    if (!row) throw failed();
    const source = this.providers.source(row);
    const event = this.providers.forProvider(provider).verifyDelivery(body, headers, source);
    validateSource(row, event);
    await this.db.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM connection WHERE id = ${id}::uuid AND secret_ref = ${row.secretRef}
          AND status <> 'disconnected' FOR UPDATE
      `;
      if (!locked) throw failed();
      await enqueueEvent(tx, row, event);
      await tx.connection.update({
        where: { id }, data: { lastDeliveryAt: new Date(), status: locked.status === 'pending' ? 'active' : undefined },
      });
    });
  }
}
