import { Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { safeReturnPath, session, type operations } from '@repharbor/contracts';
import { readConfiguration } from '../config';
import { Database } from '../database';
import { ApiError } from '../http';
import { randomToken, seal, tokenDigest } from './secrets';

type LinkRequest = operations['requestMagicLink']['requestBody']['content']['application/json'];

const LINK_TTL = 15 * 60_000;
const invitationIsActive = { acceptedAt: null, revokedAt: null };

const sessionView = {
  user: { include: { memberships: { include: { company: true }, orderBy: { companyId: 'asc' } } } },
  pendingInvitation: true,
} satisfies Prisma.UserSessionInclude;

type SessionView = Prisma.UserSessionGetPayload<{ include: typeof sessionView }>;

@Injectable()
export class AuthService {
  private readonly config = readConfiguration();
  private readonly key = Buffer.from(this.config.SECRET_ENCRYPTION_KEY, 'base64');

  constructor(private readonly database: Database) {}

  private async rateLimit(scope: string, subject: string, limit: number, windowMilliseconds: number) {
    const fingerprint = createHmac('sha256', this.key).update(subject).digest('hex');
    const key = `${scope}:${fingerprint}`;
    const now = new Date();
    const expiry = new Date(now.getTime() + windowMilliseconds);
    const [record] = await this.database.$queryRaw<{ attempts: number }[]>`
      INSERT INTO auth_rate_limit (key, expires_at, attempts)
      VALUES (${key}, ${expiry}, 1)
      ON CONFLICT (key) DO UPDATE SET
        attempts = CASE WHEN auth_rate_limit.expires_at <= ${now} THEN 1 ELSE least(auth_rate_limit.attempts, ${limit}) + 1 END,
        expires_at = CASE WHEN auth_rate_limit.expires_at <= ${now} THEN ${expiry} ELSE auth_rate_limit.expires_at END
      RETURNING attempts
    `;
    if (record.attempts > limit) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many attempts. Wait a few minutes and try again.');
    }
  }

  async requestLink(input: LinkRequest, ip: string) {
    await this.rateLimit('request-ip', ip, 30, LINK_TTL);
    await this.rateLimit('request-email', input.email, 5, LINK_TTL);

    const token = randomToken();
    const expiresAt = new Date(Date.now() + LINK_TTL);
    const returnPath = safeReturnPath(input.returnPath);
    await this.database.$transaction(async (tx) => {
      const invitation = input.invitationToken ? await tx.invitation.findFirst({
        where: {
          tokenDigest: tokenDigest(input.invitationToken), email: input.email,
          expiresAt: { gt: new Date() }, ...invitationIsActive,
        },
        select: { id: true },
      }) : null;
      const link = await tx.loginLink.create({
        data: { email: input.email, tokenDigest: tokenDigest(token), returnPath, expiresAt, invitationId: invitation?.id },
        select: { id: true },
      });
      await tx.job.create({
        data: {
          kind: 'login_mail', dedupeKey: `login-mail:${link.id}`, state: 'ready',
          args: { linkId: link.id, sealedToken: seal(token, this.key) },
        },
      });
    });
  }

  async exchange(token: string, ip: string) {
    await this.rateLimit('exchange-ip', ip, 60, LINK_TTL);
    const sessionToken = randomToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.SESSION_TTL_SECONDS * 1000);

    const payload = await this.database.$transaction(async (tx) => {
      const [link] = await tx.loginLink.updateManyAndReturn({
        where: { tokenDigest: tokenDigest(token), expiresAt: { gt: now }, consumedAt: null },
        data: { consumedAt: now },
      });
      if (!link) throw new ApiError(410, 'LINK_UNAVAILABLE', 'This sign-in link expired or was already used. Request a new link.');

      const user = await tx.appUser.upsert({
        where: { email: link.email }, update: {}, create: { email: link.email },
      });
      const created = await tx.userSession.create({
        data: { userId: user.id, tokenDigest: tokenDigest(sessionToken), expiresAt, pendingInvitationId: link.invitationId },
        include: sessionView,
      });
      return { ...this.serialize(created), ...(link.returnPath && { returnPath: link.returnPath }) };
    });
    return { payload, sessionToken, expiresAt };
  }

  async requireSession(token: string | undefined) {
    const result = token && await this.database.userSession.findFirst({
      where: { tokenDigest: tokenDigest(token), expiresAt: { gt: new Date() }, revokedAt: null },
      include: sessionView,
    });
    if (!result) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    return result;
  }

  serialize(view: SessionView) {
    const invitation = view.pendingInvitation;
    return session.parse({
      userId: view.user.id,
      email: view.user.email,
      companies: view.user.memberships.map(({ company }) => company),
      ...(invitation && invitation.email === view.user.email && invitation.expiresAt > new Date()
        && !invitation.revokedAt && !invitation.acceptedAt && { pendingInvitationId: invitation.id }),
    });
  }

  async revoke(sessionId: string) {
    await this.database.userSession.updateMany({
      where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() },
    });
  }
}
