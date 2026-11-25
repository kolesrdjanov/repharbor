import { Injectable } from '@nestjs/common';
import type { Prisma, ReviewItem, SaleEffect } from '@prisma/client';
import { reviewItem, type pagination, type resolveReview } from '@repharbor/contracts';
import type { z } from 'zod';
import { readConfiguration } from '../config';
import { Database } from '../database';
import { ApiError } from '../http';
import { requireFounder, resourceNotFound, type Actor } from '../engagement/access';
import { audit, decodeCursor, idempotent, paginated } from '../engagement/storage';
import { recomputeClaim } from '../ledger/commission';

export async function mappedProduct(tx: Prisma.TransactionClient, effect: SaleEffect) {
  const mapping = await tx.productMapping.findUnique({ where: { connectionId_externalProduct_channel: {
    connectionId: effect.connectionId, externalProduct: effect.externalProduct, channel: effect.channel,
  } } });
  return mapping?.productId;
}

export async function linkForEffect(tx: Prisma.TransactionClient, effect: SaleEffect) {
  const productId = await mappedProduct(tx, effect);
  if (!productId) return null;
  return tx.customerLink.findUnique({ where: { connectionId_productId_externalCustomer: {
    connectionId: effect.connectionId, productId, externalCustomer: effect.externalCustomer,
  } } });
}

@Injectable()
export class Attribution {
  private readonly environment = readConfiguration().SALES_ENVIRONMENT;

  constructor(private readonly db: Database) {}

  private async serialize(tx: Prisma.TransactionClient, row: ReviewItem & { effect: SaleEffect }) {
    const productId = await mappedProduct(tx, row.effect);
    const candidates = productId ? await tx.claim.findMany({
      where: { companyId: row.companyId, productId, status: 'approved' },
      select: { id: true, customerLabel: true },
      orderBy: { id: 'asc' }, take: 100,
    }) : [];
    return reviewItem.parse({
      id: row.id, effectId: row.effectId, reason: row.reason,
      customerLabel: row.effect.externalCustomer, candidateClaimIds: candidates.map(({ id }) => id),
      candidateClaims: candidates, resolvedAt: row.resolvedAt?.toISOString(),
      amountMinor: row.effect.amountMinor.toString(), currency: row.effect.currency,
    });
  }

  async list(actor: Actor, companyId: string, query: z.infer<typeof pagination>) {
    await requireFounder(this.db, actor, companyId);
    const scope = `review:${actor.userId}:${companyId}:${this.environment}`;
    const cursor = decodeCursor(query.cursor, scope);
    const rows = await this.db.reviewItem.findMany({
      where: {
        companyId, effect: { connection: { environment: this.environment } }, resolvedAt: null,
        ...(cursor && { id: { gt: cursor } }),
      },
      orderBy: { id: 'asc' }, take: query.limit + 1, include: { effect: true },
    });
    const result = paginated(rows, query.limit, scope, (row) => row);
    return { ...result, items: await Promise.all(result.items.map((row) => this.serialize(this.db, row))) };
  }

  resolve(actor: Actor, companyId: string, reviewId: string, key: string, input: z.infer<typeof resolveReview>) {
    return this.db.$transaction(async (tx) => {
      await requireFounder(tx, actor, companyId);
      await tx.$queryRaw`SELECT id FROM company WHERE id = ${companyId}::uuid FOR UPDATE`;
      return idempotent(tx, actor, `resolve:${companyId}:${reviewId}:${this.environment}`, key, input, 200, reviewItem, async () => {
        const review = await tx.reviewItem.findFirst({ where: {
          id: reviewId, companyId, effect: { connection: { environment: this.environment } },
        }, include: { effect: true } });
        if (!review) throw resourceNotFound();
        const { effect } = review;
        const existingLink = await linkForEffect(tx, effect);
        let claimId: string | undefined;
        if (input.action === 'assign_claim') {
          const productId = await mappedProduct(tx, effect);
          if (!productId || effect.kind !== 'collection') {
            throw new ApiError(409, 'MAPPING_REQUIRED', 'Map the source product before assigning a collection.');
          }
          const claim = await tx.claim.findFirst({ where: { id: input.claimId, companyId, productId, status: 'approved' } });
          if (!claim) throw resourceNotFound();
          const link = { connectionId: effect.connectionId, productId, externalCustomer: effect.externalCustomer };
          await tx.customerLink.upsert({
            where: { connectionId_productId_externalCustomer: link },
            create: { ...link, companyId, claimId: claim.id }, update: { claimId: claim.id },
          });
          claimId = claim.id;
        } else {
          await tx.saleEffect.update({ where: { id: effect.id }, data: { disposition: 'ineligible' } });
        }
        const resolved = await tx.reviewItem.update({
          where: { id: review.id }, data: { resolvedAt: new Date(), resolvedBy: actor.userId, resolution: input.action },
          include: { effect: true },
        });
        await audit(tx, actor, companyId, 'review_item', review.id, input.action, {
          reason: input.reason, ...(claimId && { claimId }), ...(existingLink && { previousClaimId: existingLink.claimId }),
        });
        if (existingLink && existingLink.claimId !== claimId) await recomputeClaim(tx, existingLink.claimId, this.environment, actor.userId);
        if (claimId) await recomputeClaim(tx, claimId, this.environment, actor.userId);
        return this.serialize(tx, resolved);
      });
    }, { timeout: 30_000 });
  }
}
