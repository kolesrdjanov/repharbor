import type { Prisma, SaleEffect } from '@prisma/client';

export async function markForReview(tx: Prisma.TransactionClient, effect: SaleEffect, reason: string) {
  await tx.saleEffect.update({ where: { id: effect.id }, data: { disposition: 'review' } });
  await tx.$executeRaw`
    INSERT INTO review_item (company_id, effect_id, reason)
    VALUES (${effect.companyId}::uuid, ${effect.id}::uuid, ${reason})
    ON CONFLICT (effect_id, reason) WHERE resolved_at IS NULL DO NOTHING
  `;
}

export async function classifyEffect(tx: Prisma.TransactionClient, effect: SaleEffect, declaredReason?: string) {
  if (declaredReason) return markForReview(tx, effect, declaredReason);
  if (effect.kind !== 'collection') {
    if (!effect.originalExternalKey) return markForReview(tx, effect, 'REFUND_ORIGINAL_UNKNOWN');
    const originals = await tx.saleEffect.findMany({
      where: {
        connectionId: effect.connectionId, kind: 'collection', currency: effect.currency,
        originalExternalKey: effect.originalExternalKey,
      },
      take: 2,
    });
    if (originals.length > 1) return markForReview(tx, effect, 'REFUND_ALLOCATION_UNKNOWN');
    if (!originals.length) return;
    const original = originals[0];
    await tx.saleEffect.update({
      where: { id: effect.id }, data: {
        originalEffectId: original.id, externalProduct: original.externalProduct,
        externalCustomer: original.externalCustomer, channel: original.channel,
      },
    });
    return;
  }
  if (effect.basisMinor === null) return markForReview(tx, effect, 'BASIS_UNKNOWN');
  const mapping = await tx.productMapping.findUnique({
    where: { connectionId_externalProduct_channel: {
      connectionId: effect.connectionId, externalProduct: effect.externalProduct, channel: effect.channel,
    } },
    include: { connection: { select: { environment: true } } },
  });
  if (!mapping) return markForReview(tx, effect, 'PRODUCT_UNMAPPED');
  const authority = await tx.sourceAuthority.findUnique({ where: { productId_channel_environment: {
    productId: mapping.productId, channel: effect.channel, environment: mapping.connection.environment,
  } } });
  if (authority?.connectionId !== effect.connectionId) {
    await tx.saleEffect.update({ where: { id: effect.id }, data: { disposition: 'secondary' } });
    return;
  }
  return markForReview(tx, effect, 'CUSTOMER_UNMATCHED');
}
