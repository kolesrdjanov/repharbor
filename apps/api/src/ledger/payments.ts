import { Injectable } from '@nestjs/common';
import { externalPayment, opening, entry, type recordExternalPayment, type proposeOpening } from '@repharbor/contracts';
import type { z } from 'zod';
import type { ExternalPayment, OpeningBalance } from '@prisma/client';
import { readConfiguration } from '../config';
import { Database } from '../database';
import { requireEngagement, resourceNotFound, type Actor } from '../engagement/access';
import { audit, idempotent } from '../engagement/storage';
import { ApiError } from '../http';
import { localMidnight, sqlDate } from './calendar';
import { reverseLedger } from './commission';
import { viewEntry } from './statements';

function parseAmount(input: string) {
  const amount = BigInt(input);
  if (amount < -(1n << 63n) || amount >= (1n << 63n)) {
    throw new ApiError(400, 'AMOUNT_OUT_OF_RANGE', 'Enter a smaller amount.');
  }
  return amount;
}

function viewPayment(row: ExternalPayment) {
  return externalPayment.parse({
    id: row.id, engagementId: row.engagementId, currency: row.currency, amountMinor: row.amountMinor.toString(),
    paidOn: row.paidOn.toISOString().slice(0, 10), reference: row.reference ?? undefined,
    recordedAt: row.recordedAt.toISOString(), recordedBy: row.recordedBy,
  });
}

function viewOpening(row: OpeningBalance) {
  return opening.parse({
    id: row.id, engagementId: row.engagementId, currency: row.currency, amountMinor: row.amountMinor.toString(),
    asOf: row.asOf.toISOString().slice(0, 10), note: row.note, acceptedAt: row.acceptedAt?.toISOString(),
  });
}

@Injectable()
export class Payments {
  private readonly environment = readConfiguration().SALES_ENVIRONMENT;

  constructor(private readonly db: Database) {}

  record(actor: Actor, engagementId: string, key: string, input: z.infer<typeof recordExternalPayment>) {
    return this.db.$transaction(async (tx) => {
      const { item } = await requireEngagement(tx, actor, engagementId, 'founder', true);
      return idempotent(tx, actor, `payment:${engagementId}:${this.environment}`, key, input, 201, externalPayment, async () => {
        const amount = parseAmount(input.amountMinor);
        const effectiveAt = localMidnight(input.paidOn, item.product.company.timeZone);
        if (effectiveAt > new Date()) throw new ApiError(422, 'FUTURE_PAYMENT', 'Enter the date the payment was made.');
        const payment = await tx.externalPayment.create({ data: {
          engagementId, environment: this.environment, currency: input.currency, amountMinor: amount,
          paidOn: sqlDate(input.paidOn), reference: input.reference, recordedBy: actor.userId,
        } });
        await tx.ledgerEntry.create({ data: {
          companyId: item.companyId, engagementId, environment: this.environment, kind: 'external_payment',
          postingKey: `payment:${payment.id}`, currency: input.currency, deltaMinor: -amount, effectiveAt,
          paymentId: payment.id, actorId: actor.userId,
        } });
        await audit(tx, actor, item.companyId, 'external_payment', payment.id, 'record');
        return viewPayment(payment);
      });
    });
  }

  reverse(actor: Actor, engagementId: string, paymentId: string, key: string, reason: string) {
    return this.db.$transaction(async (tx) => {
      const { item } = await requireEngagement(tx, actor, engagementId, 'founder', true);
      return idempotent(tx, actor, `reverse-payment:${engagementId}:${paymentId}:${this.environment}`, key, { reason }, 200, entry, async () => {
        const original = await tx.ledgerEntry.findFirst({
          where: { engagementId, paymentId, environment: this.environment, kind: 'external_payment' },
          include: { reversal: true },
        });
        if (!original) throw resourceNotFound();
        if (original.reversal) throw new ApiError(409, 'ALREADY_REVERSED', 'This payment was already reversed.');
        const reversal = await reverseLedger(tx, original, reason, actor.userId);
        await audit(tx, actor, item.companyId, 'external_payment', paymentId, 'reverse', { reason });
        return viewEntry(reversal);
      });
    });
  }

  async openingList(actor: Actor, engagementId: string) {
    await requireEngagement(this.db, actor, engagementId);
    return (await this.db.openingBalance.findMany({
      where: { engagementId, environment: this.environment }, orderBy: { currency: 'asc' },
    })).map(viewOpening);
  }

  propose(actor: Actor, engagementId: string, key: string, input: z.infer<typeof proposeOpening>) {
    return this.db.$transaction(async (tx) => {
      const { item } = await requireEngagement(tx, actor, engagementId, 'founder', true);
      return idempotent(tx, actor, `opening:${engagementId}:${this.environment}`, key, input, 201, opening, async () => {
        const prior = await tx.openingBalance.findUnique({ where: { engagementId_currency_environment: {
          engagementId, currency: input.currency, environment: this.environment,
        } } });
        if (prior) throw new ApiError(409, 'OPENING_EXISTS', 'An opening balance already exists for this currency.');
        const created = await tx.openingBalance.create({ data: {
          ...input, engagementId, environment: this.environment, amountMinor: parseAmount(input.amountMinor),
          asOf: sqlDate(input.asOf), proposedBy: actor.userId,
        } });
        await audit(tx, actor, item.companyId, 'opening_balance', created.id, 'propose');
        return viewOpening(created);
      });
    });
  }

  accept(actor: Actor, engagementId: string, openingId: string, key: string) {
    return this.db.$transaction(async (tx) => {
      const { item } = await requireEngagement(tx, actor, engagementId, 'rep', true);
      return idempotent(tx, actor, `accept-opening:${engagementId}:${openingId}:${this.environment}`, key, {}, 200, opening, async () => {
        const prior = await tx.openingBalance.findFirst({ where: { id: openingId, engagementId, environment: this.environment } });
        if (!prior) throw resourceNotFound();
        if (prior.acceptedAt) return viewOpening(prior);
        const accepted = await tx.openingBalance.update({ where: { id: openingId }, data: { acceptedAt: new Date(), acceptedBy: actor.userId } });
        await tx.ledgerEntry.create({ data: {
          companyId: item.companyId, engagementId, environment: this.environment, kind: 'opening',
          postingKey: `opening:${openingId}`, openingId, currency: prior.currency, deltaMinor: prior.amountMinor,
          effectiveAt: localMidnight(prior.asOf.toISOString().slice(0, 10), item.product.company.timeZone), dueOn: prior.asOf,
          reason: prior.note, actorId: actor.userId,
        } });
        await audit(tx, actor, item.companyId, 'opening_balance', openingId, 'accept');
        return viewOpening(accepted);
      });
    });
  }
}
