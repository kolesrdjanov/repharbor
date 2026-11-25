import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import nodemailer, { type Transporter } from 'nodemailer';
import { z } from 'zod';
import { readConfiguration } from '../config';
import { Database } from '../database';
import { unseal } from './secrets';

const argsSchema = z.object({ linkId: z.uuid(), sealedToken: z.string() });
const MAX_ATTEMPTS = 5;

type Lease = { id: string; kind: string; args: unknown; attempts: number; leaseToken: string };

@Injectable()
export class LoginMailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly config = readConfiguration();
  private readonly key = Buffer.from(this.config.SECRET_ENCRYPTION_KEY, 'base64');
  private readonly logger = new Logger(LoginMailWorker.name);
  private readonly stop = new AbortController();
  private readonly smtp: Transporter | undefined;
  private loop: Promise<void> | undefined;
  private nextCleanup = 0;

  constructor(private readonly database: Database) {
    if (this.config.MAIL_TRANSPORT === 'smtp') {
      const url = new URL(this.config.SMTP_URL!);
      this.smtp = nodemailer.createTransport({
        host: url.hostname, port: Number(url.port || (url.protocol === 'smtps:' ? 465 : 25)),
        secure: url.protocol === 'smtps:',
        connectionTimeout: 5_000, greetingTimeout: 5_000, socketTimeout: 10_000,
        ...(url.username && { auth: { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) } }),
      });
    }
  }

  onModuleInit() {
    this.loop = this.process();
  }

  async onModuleDestroy() {
    this.stop.abort();
    await this.loop;
    this.smtp?.close();
  }

  private async nextJob() {
    const leaseToken = randomUUID();
    const [job] = await this.database.$queryRaw<Lease[]>`
      WITH head AS (
        SELECT id FROM job
        WHERE kind IN ('login_mail', 'invitation_mail') AND (
          (state = 'ready' AND run_after <= now()) OR (state = 'leased' AND lease_until <= now())
        )
        ORDER BY run_after, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE job
      SET state = 'leased', lease_token = ${leaseToken}::uuid, lease_until = now() + interval '60 seconds',
          attempts = attempts + 1
      FROM head WHERE job.id = head.id
      RETURNING job.id, job.kind, job.args, job.attempts, job.lease_token AS "leaseToken"
    `;
    return job;
  }

  private async send(jobId: string, email: string, token: string, invitation: boolean) {
    const url = new URL('/auth/confirm', this.config.APP_ORIGIN);
    url.hash = new URLSearchParams({ token }).toString();
    const subject = invitation ? 'Sign in to review your RepHarbor invitation' : 'Your RepHarbor sign-in link';
    const text = `Open this link and select Confirm sign-in to continue:\n\n${url.href}\n\nThis link expires in 15 minutes. If you did not request it, you can ignore this email.`;
    return this.sendMessage(jobId, email, subject, text);
  }

  private async sendMessage(jobId: string, email: string, subject: string, text: string) {
    if (this.smtp) {
      await this.smtp.sendMail({ from: this.config.MAIL_FROM, to: email, subject, text });
      return;
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.RESEND_API_KEY}`, 'Content-Type': 'application/json',
        'Idempotency-Key': `repharbor-mail-${jobId}`,
      },
      body: JSON.stringify({ from: this.config.MAIL_FROM, to: [email], subject, text }),
      signal: AbortSignal.timeout(15_000),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error('Resend delivery failed');
  }

  private async finish(job: Lease, code?: string) {
    const retry = code === 'MAIL_DELIVERY_FAILED' && job.attempts < MAX_ATTEMPTS;
    await this.database.job.updateMany({
      where: { id: job.id, state: 'leased', leaseToken: job.leaseToken },
      data: {
        state: retry ? 'ready' : code ? 'failed' : 'done',
        leaseUntil: null,
        leaseToken: null,
        lastErrorCode: code ?? null,
        ...(retry
          ? { runAfter: new Date(Date.now() + 4_000 * 2 ** job.attempts) }
          : { args: {} }),
      },
    });
  }

  private async deliver(job: Lease) {
    const args = argsSchema.safeParse(job.args);
    if (!args.success) return this.finish(job, 'INVALID_MAIL_JOB');
    if (job.attempts > MAX_ATTEMPTS) return this.finish(job, 'MAIL_RETRY_LIMIT');
    try {
      if (job.kind === 'invitation_mail') {
        const invite = await this.database.invitation.findUnique({ where: { id: args.data.linkId } });
        if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) {
          return this.finish(job, 'LINK_UNAVAILABLE');
        }
        const url = new URL('/invite', this.config.APP_ORIGIN);
        url.hash = new URLSearchParams({ token: unseal(args.data.sealedToken, this.key) }).toString();
        await this.sendMessage(job.id, invite.email, 'You are invited to RepHarbor',
          `Open this link to review your invitation:\n\n${url.href}\n\nThis invitation expires in seven days.`);
      } else {
        const link = await this.database.loginLink.findUnique({ where: { id: args.data.linkId } });
        if (!link || link.consumedAt || link.expiresAt <= new Date()) return this.finish(job, 'LINK_UNAVAILABLE');
        await this.send(job.id, link.email, unseal(args.data.sealedToken, this.key), Boolean(link.invitationId));
      }
    } catch {
      return this.finish(job, 'MAIL_DELIVERY_FAILED');
    }
    await this.finish(job);
  }

  private async cleanup() {
    const now = new Date();
    if (this.nextCleanup > now.getTime()) return;
    await this.database.$transaction([
      this.database.authRateLimit.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.database.loginLink.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.database.userSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    ]);
    this.nextCleanup = now.getTime() + 5 * 60_000;
  }

  private async process() {
    while (!this.stop.signal.aborted) {
      try {
        await this.cleanup();
        const job = await this.nextJob();
        if (job) {
          await this.deliver(job);
          continue;
        }
      } catch {
        this.logger.warn('Login mail queue is temporarily unavailable.');
      }
      await delay(1_000, undefined, { signal: this.stop.signal }).catch(() => undefined);
    }
  }
}
