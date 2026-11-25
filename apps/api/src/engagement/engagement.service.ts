import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import {
  company, product, engagementContext, engagementSummary, type createCompany, type createProduct,
  type pagination, type proposeAgreement, type registerClaim, type decideClaim,
} from '@repharbor/contracts';
import { readConfiguration } from '../config';
import { engagementBalances } from '../ledger/statements';
import { recomputeClaim } from '../ledger/commission';
import { Database } from '../database';
import { ApiError } from '../http';
import { requireEngagement, requireFounder, resourceNotFound, type Actor } from './access';
import { viewAgreement, viewClaim, viewEngagement } from './serialize';
import { audit, decodeCursor, paginated } from './storage';

type Pagination = z.infer<typeof pagination>;

const stale = () => new ApiError(409, 'STALE_REVISION', 'Refresh to review the latest agreement revision.');
const closed = () => new ApiError(409, 'ENGAGEMENT_CLOSED', 'This engagement is closed.');
const claimConflict = () => new ApiError(409, 'COMPETING_CLAIM', 'This customer already has an approved claim for this product.');

@Injectable()
export class EngagementService {
  private readonly environment = readConfiguration().SALES_ENVIRONMENT;

  constructor(private readonly db: Database) {}

  createCompany(actor: Actor, data: z.infer<typeof createCompany>) {
    return this.db.$transaction(async (tx) => {
      const created = await tx.company.create({ data });
      await tx.companyFounder.create({ data: { companyId: created.id, userId: actor.userId } });
      await audit(tx, actor, created.id, 'company', created.id, 'create');
      return company.parse(created);
    });
  }

  async listProducts(actor: Actor, companyId: string, query: Pagination) {
    await requireFounder(this.db, actor, companyId);
    const scope = `products:${actor.userId}:${companyId}`;
    const cursor = decodeCursor(query.cursor, scope);
    const rows = await this.db.product.findMany({
      where: { companyId, ...(cursor && { id: { gt: cursor } }) },
      orderBy: { id: 'asc' }, take: query.limit + 1,
    });
    return paginated(rows, query.limit, scope, (row) => product.parse(row));
  }

  createProduct(actor: Actor, companyId: string, data: z.infer<typeof createProduct>) {
    return this.db.$transaction(async (tx) => {
      await requireFounder(tx, actor, companyId);
      const created = await tx.product.create({ data: { ...data, companyId } });
      await audit(tx, actor, companyId, 'product', created.id, 'create');
      return product.parse(created);
    });
  }

  async dashboard(actor: Actor, companyId: string | undefined, query: Pagination) {
    if (companyId) await requireFounder(this.db, actor, companyId);
    const scope = `engagements:${actor.userId}:${companyId ?? 'portfolio'}`;
    const cursor = decodeCursor(query.cursor, scope);
    const rows = await this.db.engagement.findMany({
      where: {
        ...(companyId
          ? { companyId, product: { company: { founders: { some: { userId: actor.userId } } } } }
          : { repId: actor.userId }),
        ...(cursor && { id: { gt: cursor } }),
      },
      include: { product: { include: { company: true } }, rep: { select: { email: true } } },
      orderBy: { id: 'asc' }, take: query.limit + 1,
    });
    const result = paginated(rows, query.limit, scope, (row) => row);
    const cutoff = new Date();
    return { ...result, items: await Promise.all(result.items.map(async (row) => {
      const balances = await engagementBalances(this.db, row.id, this.environment, cutoff, row.product.company.timeZone);
      return engagementSummary.parse({
        engagement: viewEngagement(row), companyName: row.product.company.name, productName: row.product.name,
        repEmail: companyId ? row.rep?.email : undefined, balances,
      });
    })) };
  }

  async read(actor: Actor, engagementId: string) {
    const { item, role } = await requireEngagement(this.db, actor, engagementId);
    return engagementContext.parse({ engagement: viewEngagement(item), viewerRole: role });
  }

  async agreements(actor: Actor, engagementId: string, query: Pagination) {
    await requireEngagement(this.db, actor, engagementId);
    const scope = `agreements:${actor.userId}:${engagementId}`;
    const cursor = decodeCursor(query.cursor, scope);
    const rows = await this.db.agreementVersion.findMany({
      where: { engagementId, ...(cursor && { id: { gt: cursor } }) },
      orderBy: { id: 'asc' }, take: query.limit + 1,
    });
    return paginated(rows, query.limit, scope, viewAgreement);
  }

  propose(actor: Actor, engagementId: string, input: z.infer<typeof proposeAgreement>) {
    return this.db.$transaction(async (tx) => {
      const { item } = await requireEngagement(tx, actor, engagementId, 'founder', true);
      if (item.closedAt) throw closed();
      const previous = await tx.agreementVersion.findFirst({ where: { engagementId }, orderBy: { revision: 'desc' } });
      if ((previous?.revision ?? 0) !== input.previousRevision) throw stale();
      const created = await tx.agreementVersion.create({
        data: {
          ...input.terms, engagementId, revision: input.previousRevision + 1,
          proposedBy: actor.userId, founderAcceptedAt: new Date(),
        },
      });
      await audit(tx, actor, item.companyId, 'agreement', created.id, 'propose', { revision: created.revision });
      return viewAgreement(created);
    });
  }

  accept(actor: Actor, engagementId: string, agreementId: string, revision: number) {
    return this.db.$transaction(async (tx) => {
      const { item } = await requireEngagement(tx, actor, engagementId, 'rep', true);
      const current = await tx.agreementVersion.findFirst({ where: { engagementId }, orderBy: { revision: 'desc' } });
      if (!current || current.id !== agreementId || current.revision !== revision) throw stale();
      if (current.repAcceptedAt) return viewAgreement(current);
      if (item.closedAt) throw closed();
      const accepted = await tx.agreementVersion.update({
        where: { id: current.id }, data: { repAcceptedAt: new Date(), acceptedByRep: actor.userId },
      });
      await audit(tx, actor, item.companyId, 'agreement', current.id, 'accept', { revision });
      const claims = await tx.claim.findMany({ where: { engagementId, status: 'approved', links: { some: {} } }, select: { id: true } });
      for (const claim of claims) await recomputeClaim(tx, claim.id, this.environment, actor.userId);
      return viewAgreement(accepted);
    });
  }

  close(actor: Actor, engagementId: string) {
    return this.db.$transaction(async (tx) => {
      const { item } = await requireEngagement(tx, actor, engagementId, 'founder', true);
      if (item.closedAt) return viewEngagement(item);
      const updated = await tx.engagement.update({ where: { id: engagementId }, data: { closedAt: new Date() } });
      await audit(tx, actor, item.companyId, 'engagement', engagementId, 'close');
      return viewEngagement(updated);
    });
  }

  private async competingCount(db: Prisma.TransactionClient, claim: { id: string; companyId: string; productId: string; customerKey: string | null }) {
    return db.claim.count({ where: {
      id: { not: claim.id }, companyId: claim.companyId, productId: claim.productId,
      customerKey: claim.customerKey, status: { in: ['approved', 'pending'] },
    } });
  }

  async claims(actor: Actor, engagementId: string, query: Pagination) {
    const { role } = await requireEngagement(this.db, actor, engagementId);
    const scope = `claims:${actor.userId}:${engagementId}`;
    const cursor = decodeCursor(query.cursor, scope);
    const rows = await this.db.claim.findMany({
      where: { engagementId, ...(cursor && { id: { gt: cursor } }) },
      orderBy: { id: 'asc' }, take: query.limit + 1,
    });
    const visible = paginated(rows, query.limit, scope, (row) => row);
    const items = await Promise.all(visible.items.map(async (row) =>
      viewClaim(row, role === 'founder' ? await this.competingCount(this.db, row) : undefined),
    ));
    return { ...visible, items };
  }

  register(actor: Actor, engagementId: string, input: z.infer<typeof registerClaim>) {
    return this.db.$transaction(async (tx) => {
      const { item } = await requireEngagement(tx, actor, engagementId, 'rep', true);
      if (item.closedAt) throw closed();
      const row = await tx.claim.create({
        data: { ...input, companyId: item.companyId, productId: item.productId, engagementId, status: 'pending' },
      });
      await audit(tx, actor, item.companyId, 'claim', row.id, 'register');
      return viewClaim(row);
    });
  }

  async decide(actor: Actor, engagementId: string, claimId: string, input: z.infer<typeof decideClaim>) {
    try {
      return await this.db.$transaction(async (tx) => {
        const { item } = await requireEngagement(tx, actor, engagementId, 'founder', true);
        const current = await tx.claim.findUnique({ where: { engagementId_id: { engagementId, id: claimId } } });
        if (!current) throw resourceNotFound();
        const reason = input.decision === 'declined' ? input.reason : null;
        if (current.status !== 'pending') {
          if (current.status === input.decision && current.reason === reason) {
            return viewClaim(current, await this.competingCount(tx, current));
          }
          throw new ApiError(409, 'CLAIM_ALREADY_DECIDED', 'Refresh to see the recorded decision.');
        }
        const updated = await tx.claim.update({
          where: { id: current.id }, data: { status: input.decision, reason, decidedAt: new Date(), decidedBy: actor.userId },
        });
        await audit(tx, actor, item.companyId, 'claim', current.id, input.decision, reason ? { reason } : {});
        return viewClaim(updated, await this.competingCount(tx, updated));
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw claimConflict();
      throw error;
    }
  }
}
