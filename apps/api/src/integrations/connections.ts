import { Injectable } from '@nestjs/common';
import { Prisma, type Connection } from '@prisma/client';
import { connection, productMapping, type connectProvider, type pagination, type setMappings } from '@repharbor/contracts';
import type { z } from 'zod';
import { Database } from '../database';
import { ApiError } from '../http';
import { requireFounder, resourceNotFound, type Actor } from '../engagement/access';
import { audit, decodeCursor, paginated } from '../engagement/storage';
import type { Credentials } from './provider';
import { Providers } from './providers';

type Pagination = z.infer<typeof pagination>;

export function viewConnection(row: Connection) {
  return connection.parse({
    id: row.id, companyId: row.companyId, provider: row.provider, environment: row.environment,
    externalAccount: `••••${row.externalAccount.length > 4 ? row.externalAccount.slice(-4) : ''}`, status: row.status, coverageFrom: row.coverageFrom?.toISOString(),
    lastDeliveryAt: row.lastDeliveryAt?.toISOString(), reconciledAt: row.reconciledAt?.toISOString(),
  });
}

export async function requireConnection(db: Prisma.TransactionClient, actor: Actor, companyId: string, id: string) {
  await requireFounder(db, actor, companyId);
  const row = await db.connection.findUnique({ where: { companyId_id: { companyId, id } } });
  if (!row) throw resourceNotFound();
  return row;
}

@Injectable()
export class Connections {
  constructor(private readonly db: Database, private readonly providers: Providers) {}

  async list(actor: Actor, companyId: string, query: Pagination) {
    await requireFounder(this.db, actor, companyId);
    const scope = `connections:${companyId}:${actor.userId}`;
    const cursor = decodeCursor(query.cursor, scope);
    const rows = await this.db.connection.findMany({
      where: { companyId, ...(cursor && { id: { gt: cursor } }) },
      orderBy: { id: 'asc' }, take: query.limit + 1,
    });
    return paginated(rows, query.limit, scope, viewConnection);
  }

  async connect(actor: Actor, companyId: string, input: z.infer<typeof connectProvider>) {
    await requireFounder(this.db, actor, companyId);
    await this.providers.forProvider(input.provider).configure({ ...input, companyId, id: '' });
    try {
      return await this.db.$transaction(async (tx) => {
        await requireFounder(tx, actor, companyId);
        const { provider, environment, externalAccount, credentials } = input;
        const row = await tx.connection.create({
          data: { companyId, provider, environment, externalAccount, secretRef: this.providers.encrypt(credentials), status: 'pending' },
        });
        await audit(tx, actor, companyId, 'connection', row.id, 'connect');
        return viewConnection(row);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError(409, 'CONNECTION_EXISTS', 'This source already has a connection. Use reconnect if you manage it.');
      }
      throw error;
    }
  }

  async reconnect(actor: Actor, companyId: string, id: string, credentials: Credentials) {
    const row = await requireConnection(this.db, actor, companyId, id);
    const source = this.providers.source(row);
    await this.providers.forProvider(source.provider).configure({ ...source, credentials });
    return this.db.$transaction(async (tx) => {
      await requireConnection(tx, actor, companyId, id);
      const updated = await tx.connection.update({
        where: { id }, data: { secretRef: this.providers.encrypt(credentials), status: 'pending', nextReconciliationAt: null },
      });
      await audit(tx, actor, companyId, 'connection', id, 'reconnect');
      return viewConnection(updated);
    });
  }

  disconnect(actor: Actor, companyId: string, id: string) {
    return this.db.$transaction(async (tx) => {
      await requireConnection(tx, actor, companyId, id);
      const updated = await tx.connection.update({ where: { id }, data: { status: 'disconnected' } });
      await audit(tx, actor, companyId, 'connection', id, 'disconnect');
      return viewConnection(updated);
    });
  }

  private async mappedRows(tx: Prisma.TransactionClient, connection: Connection) {
    const [mappings, authorities] = await Promise.all([
      tx.productMapping.findMany({
        where: { connectionId: connection.id, companyId: connection.companyId },
        orderBy: [{ channel: 'asc' }, { externalProduct: 'asc' }],
      }),
      tx.sourceAuthority.findMany({ where: { connectionId: connection.id, companyId: connection.companyId } }),
    ]);
    return mappings.map((row) => productMapping.parse({
      productId: row.productId, externalProduct: row.externalProduct, channel: row.channel,
      authoritative: authorities.some((authority) => authority.productId === row.productId && authority.channel === row.channel),
    }));
  }

  async mappings(actor: Actor, companyId: string, id: string, query: Pagination) {
    const connection = await requireConnection(this.db, actor, companyId, id);
    const mappings = await this.mappedRows(this.db, connection);
    // Mapping sets are bounded to 100, and stable opaque cursors are generated from the row order.
    const scope = `mappings:${companyId}:${actor.userId}:${id}`;
    const rows = mappings.map((item, index) => ({
      ...item, id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    }));
    const cursor = decodeCursor(query.cursor, scope);
    return paginated(rows.filter((row) => !cursor || row.id > cursor), query.limit, scope, (row) => ({
      productId: row.productId, externalProduct: row.externalProduct, channel: row.channel, authoritative: row.authoritative,
    }));
  }

  setMappings(actor: Actor, companyId: string, id: string, input: z.infer<typeof setMappings>) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM company WHERE id = ${companyId}::uuid FOR UPDATE`;
      const connection = await requireConnection(tx, actor, companyId, id);
      if (connection.status === 'disconnected') throw new ApiError(409, 'CONNECTION_DISCONNECTED', 'Reconnect the source before changing mappings.');
      const products = [...new Set(input.items.map((item) => item.productId))];
      if (await tx.product.count({ where: { companyId, id: { in: products } } }) !== products.length) throw resourceNotFound();
      const unique = new Set(input.items.map((item) => JSON.stringify([item.externalProduct, item.channel])));
      if (unique.size !== input.items.length) throw new ApiError(400, 'DUPLICATE_MAPPING', 'Map each source product and channel once.');

      const existing = await this.mappedRows(tx, connection);
      const historical = await tx.saleEffect.count({ where: { connectionId: id, disposition: 'posted' } });
      if (historical && existing.some((mapping) => !input.items.some((item) => (
        item.externalProduct === mapping.externalProduct && item.channel === mapping.channel
        && item.productId === mapping.productId && item.authoritative === mapping.authoritative
      )))) {
        throw new ApiError(409, 'HISTORICAL_AUTHORITY', 'Resolve existing postings before changing their source mapping.');
      }
      await tx.sourceAuthority.deleteMany({ where: { connectionId: id } });
      await tx.productMapping.deleteMany({ where: { connectionId: id } });
      for (const { authoritative, ...mapping } of input.items) {
        await tx.productMapping.create({ data: { ...mapping, companyId, connectionId: id } });
        if (!authoritative) continue;
        const key = { productId: mapping.productId, channel: mapping.channel, environment: connection.environment };
        const authority = await tx.sourceAuthority.findUnique({ where: { productId_channel_environment: key } });
        if (authority && authority.connectionId !== id) {
          throw new ApiError(409, 'AUTHORITY_EXISTS', 'This product and channel already have an authoritative source.');
        }
        if (!authority) await tx.sourceAuthority.create({ data: { ...key, companyId, connectionId: id } });
      }
      await audit(tx, actor, companyId, 'connection', id, 'set_mappings');
      return { items: await this.mappedRows(tx, connection) };
    });
  }
}
