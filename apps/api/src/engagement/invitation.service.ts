import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  invitation, invitationPreview, type inviteRep, type inviteFounder, type invitationReference, type acceptInvitation,
} from '@repharbor/contracts';
import type { z } from 'zod';
import { randomToken, seal, tokenDigest } from '../auth/secrets';
import { readConfiguration } from '../config';
import { Database } from '../database';
import { ApiError } from '../http';
import { requireFounder, resourceNotFound, type Actor } from './access';
import { viewAgreement, viewEngagement, viewInvitation } from './serialize';
import { audit, idempotent } from './storage';

const unavailable = () => new ApiError(410, 'INVITATION_UNAVAILABLE', 'This invitation expired or was revoked. Ask the sender for a new one.');
const closed = () => new ApiError(409, 'ENGAGEMENT_CLOSED', 'This engagement is closed.');
const INVITATION_TTL = 7 * 24 * 60 * 60_000;

@Injectable()
export class InvitationService {
  private readonly key = Buffer.from(readConfiguration().SECRET_ENCRYPTION_KEY, 'base64');

  constructor(private readonly db: Database) {}

  private async create(
    tx: Prisma.TransactionClient, actor: Actor, email: string, direction: 'invite_rep' | 'invite_founder',
    engagementId?: string,
  ) {
    if (actor.email === email) throw new ApiError(400, 'SELF_INVITATION', 'Enter the other participant’s email address.');
    const token = randomToken();
    const row = await tx.invitation.create({ data: {
      senderId: actor.userId, email, direction, engagementId,
      tokenDigest: tokenDigest(token), expiresAt: new Date(Date.now() + INVITATION_TTL),
    } });
    await tx.job.create({
      data: {
        kind: 'invitation_mail', state: 'ready', dedupeKey: `invitation-mail:${row.id}`,
        args: { linkId: row.id, sealedToken: seal(token, this.key) },
      },
    });
    return row;
  }

  inviteRep(actor: Actor, companyId: string, key: string, input: z.infer<typeof inviteRep>) {
    return this.db.$transaction(async (tx) => {
      await requireFounder(tx, actor, companyId);
      return idempotent(tx, actor, `invite-rep:${companyId}`, key, input, 201, invitation, async () => {
        const product = await tx.product.findUnique({ where: { companyId_id: { companyId, id: input.productId } } });
        if (!product) throw resourceNotFound();
        const engagement = await tx.engagement.create({ data: { companyId, productId: product.id } });
        const row = await this.create(tx, actor, input.email, 'invite_rep', engagement.id);
        await tx.agreementVersion.create({ data: {
          ...input.terms, engagementId: engagement.id, revision: 1, proposedBy: actor.userId, founderAcceptedAt: new Date(),
        } });
        await audit(tx, actor, companyId, 'invitation', row.id, 'invite_rep');
        return viewInvitation(row);
      });
    });
  }

  inviteFounder(actor: Actor, key: string, input: z.infer<typeof inviteFounder>) {
    return this.db.$transaction((tx) =>
      idempotent(tx, actor, 'invite-founder', key, input, 201, invitation, async () => {
        const row = await this.create(tx, actor, input.email, 'invite_founder');
        await audit(tx, actor, null, 'invitation', row.id, 'invite_founder');
        return viewInvitation(row);
      }),
    );
  }

  private async find(tx: Prisma.TransactionClient, actor: Actor, reference: z.infer<typeof invitationReference>) {
    const where = 'token' in reference ? { tokenDigest: tokenDigest(reference.token) } : { id: reference.invitationId };
    const row = await tx.invitation.findUnique({ where });
    if (!row) throw resourceNotFound();
    if ('invitationId' in reference && row.id !== actor.pendingInvitationId && row.acceptedBy !== actor.userId) {
      throw resourceNotFound();
    }
    if (row.email !== actor.email) {
      throw new ApiError(403, 'WRONG_ACCOUNT', 'Sign in with the email address that received the invitation.');
    }
    return row;
  }

  async preview(actor: Actor, reference: z.infer<typeof invitationReference>) {
    const row = await this.find(this.db, actor, reference);
    const summary = viewInvitation(row);
    if (summary.status === 'revoked' || summary.status === 'expired') throw unavailable();
    const context = row.engagementId ? await this.db.engagement.findUnique({
      where: { id: row.engagementId },
      include: { product: { include: { company: true } }, agreements: { orderBy: { revision: 'desc' }, take: 1 } },
    }) : null;
    return invitationPreview.parse({
      invitation: summary,
      companyName: context?.product.company.name, productName: context?.product.name,
      terms: context?.agreements[0] ? viewAgreement(context.agreements[0]) : undefined,
    });
  }

  accept(actor: Actor, input: z.infer<typeof acceptInvitation>) {
    return this.db.$transaction(async (tx) => {
      const initial = await this.find(tx, actor, input);
      await tx.$queryRaw`SELECT id FROM invitation WHERE id = ${initial.id}::uuid FOR UPDATE`;
      const row = await tx.invitation.findUniqueOrThrow({ where: { id: initial.id } });
      if (row.acceptedAt && row.acceptedBy === actor.userId && row.engagementId) {
        return viewEngagement(await tx.engagement.findUniqueOrThrow({ where: { id: row.engagementId } }));
      }
      if (row.revokedAt || row.expiresAt <= new Date()) throw unavailable();
      if (row.acceptedAt) throw resourceNotFound();

      let engagement;
      if (row.direction === 'invite_rep' && row.engagementId) {
        await tx.$queryRaw`SELECT id FROM engagement WHERE id = ${row.engagementId}::uuid FOR UPDATE`;
        const existing = await tx.engagement.findUniqueOrThrow({ where: { id: row.engagementId } });
        if (existing.closedAt) throw closed();
        engagement = await tx.engagement.update({ where: { id: existing.id }, data: { repId: actor.userId } });
      } else {
        const { companyId, productId } = input;
        if (!companyId || !productId) throw new ApiError(400, 'PRODUCT_REQUIRED', 'Choose a company and product.');
        await requireFounder(tx, actor, companyId);
        if (!await tx.product.findUnique({ where: { companyId_id: { companyId, id: productId } } })) {
          throw resourceNotFound();
        }
        engagement = await tx.engagement.create({ data: { companyId, productId, repId: row.senderId } });
      }
      await tx.invitation.update({
        where: { id: row.id },
        data: { acceptedAt: new Date(), acceptedBy: actor.userId, engagementId: engagement.id },
      });
      await tx.userSession.updateMany({ where: { id: actor.id, pendingInvitationId: row.id }, data: { pendingInvitationId: null } });
      await audit(tx, actor, engagement.companyId, 'invitation', row.id, 'accept', { engagementId: engagement.id });
      return viewEngagement(engagement);
    });
  }

  revoke(actor: Actor, invitationId: string) {
    return this.db.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM invitation WHERE id = ${invitationId}::uuid AND sender_id = ${actor.userId}::uuid FOR UPDATE
      `;
      if (!locked) throw resourceNotFound();
      const row = await tx.invitation.findUniqueOrThrow({ where: { id: invitationId }, include: { engagement: true } });
      if (row.revokedAt) return;
      if (row.acceptedAt) throw new ApiError(409, 'INVITATION_ACCEPTED', 'This invitation was already accepted.');
      await tx.invitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } });
      await audit(tx, actor, row.engagement?.companyId ?? null, 'invitation', invitationId, 'revoke');
    });
  }
}
