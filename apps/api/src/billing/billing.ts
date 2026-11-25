import { Controller, Get, HttpCode, Injectable, Module, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { billing, hostedBilling, id } from '@repharbor/contracts';
import { AuthModule, checkOrigin, sessionCookie } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { readConfiguration } from '../config';
import { Database } from '../database';
import { requireFounder, type Actor } from '../engagement/access';
import { ApiError, parseInput } from '../http';

const subscriptionEvent = z.object({
  id: z.string(), customer: z.union([z.string(), z.object({ id: z.string() })]),
  status: z.enum(['active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'paused', 'trialing', 'unpaid']),
  current_period_end: z.number().int().optional(),
  items: z.object({ data: z.array(z.object({ current_period_end: z.number().int().optional() })) }).optional(),
});
const activeStatuses = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused']);
const unavailable = () => new ApiError(409, 'BILLING_UNAVAILABLE', 'Subscription billing is currently unavailable.');
const authenticationFailed = () => new ApiError(401, 'WEBHOOK_AUTH_FAILED', 'Delivery authentication failed.');

@Injectable()
class Billing {
  private readonly env = readConfiguration();
  private readonly enabled = this.env.BILLING_ENABLED === 'true';
  private readonly mode = this.env.BILLING_ENVIRONMENT;
  private readonly stripe = this.enabled && this.env.BILLING_STRIPE_KEY
    ? new Stripe(this.env.BILLING_STRIPE_KEY, { timeout: 10_000, maxNetworkRetries: 1 })
    : undefined;

  constructor(private readonly db: Database) {}

  private async account(companyId: string) {
    return this.db.billingAccount.findUnique({ where: { companyId_environment: { companyId, environment: this.mode } } });
  }

  private mayCheckout(status?: string) {
    return this.enabled && (this.mode === 'test' || this.env.BILLING_ALLOW_LIVE_CHECKOUT === 'true')
      && !activeStatuses.has(status ?? '');
  }

  async state(actor: Actor, companyId: string) {
    await requireFounder(this.db, actor, companyId);
    const account = await this.account(companyId);
    return billing.parse({
      status: account?.status ?? (this.enabled ? 'not_started' : 'unavailable'),
      currentPeriodEnd: account?.currentPeriodEnd?.toISOString(),
      checkoutAvailable: this.mayCheckout(account?.status),
      portalAvailable: this.enabled && Boolean(account),
    });
  }

  async checkout(actor: Actor, companyId: string, key: string) {
    await requireFounder(this.db, actor, companyId);
    const existing = await this.account(companyId);
    if (!this.stripe || !this.mayCheckout(existing?.status) || !this.env.BILLING_PRICE_ID) throw unavailable();
    const stripe = this.stripe;
    try {
      const customerId = existing?.stripeCustomer ?? (await stripe.customers.create({
        metadata: { companyId, purpose: 'repharbor_platform_subscription' },
      }, { idempotencyKey: `repharbor-customer:${this.mode}:${companyId}` })).id;
      const account = await this.db.billingAccount.upsert({
        where: { companyId_environment: { companyId, environment: this.mode } },
        create: { companyId, environment: this.mode, stripeCustomer: customerId, status: 'not_started', updatedAt: new Date() },
        update: {},
      });
      const returnUrl = new URL(`/companies/${companyId}/billing`, this.env.APP_ORIGIN);
      const checkout = await stripe.checkout.sessions.create({
        customer: account.stripeCustomer,
        mode: 'subscription',
        line_items: [{ price: this.env.BILLING_PRICE_ID, quantity: 1 }],
        subscription_data: { metadata: { companyId, purpose: 'repharbor_platform_subscription' } },
        success_url: returnUrl.href, cancel_url: returnUrl.href,
      }, { idempotencyKey: `repharbor-checkout:${companyId}:${key}` });
      return hostedBilling.parse({ url: checkout.url });
    } catch {
      throw unavailable();
    }
  }

  async portal(actor: Actor, companyId: string, key: string) {
    await requireFounder(this.db, actor, companyId);
    const account = await this.account(companyId);
    if (!this.stripe || !account) throw unavailable();
    try {
      const portal = await this.stripe.billingPortal.sessions.create({
        customer: account.stripeCustomer,
        return_url: new URL(`/companies/${companyId}/billing`, this.env.APP_ORIGIN).href,
      }, { idempotencyKey: `repharbor-portal:${companyId}:${key}` });
      return hostedBilling.parse({ url: portal.url });
    } catch {
      throw unavailable();
    }
  }

  async receive(raw: Buffer, signature: string | undefined) {
    if (!this.stripe || !signature || !this.env.BILLING_WEBHOOK_SECRET) throw authenticationFailed();
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(raw, signature, this.env.BILLING_WEBHOOK_SECRET);
    } catch {
      throw authenticationFailed();
    }
    if (event.livemode !== (this.mode === 'live')) {
      throw new ApiError(403, 'SOURCE_MISMATCH', 'The billing environment does not match this delivery.');
    }
    const relevant = ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type);
    const data = relevant ? subscriptionEvent.safeParse(event.data.object) : undefined;
    if (data && !data.success) throw new ApiError(400, 'INVALID_BILLING_EVENT', 'The billing event could not be processed.');
    await this.db.$transaction(async (tx) => {
      const created = await tx.billingEvent.createMany({
        data: { environment: this.mode, externalEvent: event.id, payload: { type: event.type, created: event.created, subscription: data?.data } },
        skipDuplicates: true,
      });
      const subscription = data?.data;
      if (!created.count || !subscription) return;
      const customer = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
      await tx.$queryRaw`SELECT company_id FROM billing_account WHERE stripe_customer = ${customer} AND environment = ${this.mode} FOR UPDATE`;
      const account = await tx.billingAccount.findUnique({ where: { stripeCustomer: customer } });
      if (!account || account.environment !== this.mode || account.lastEventCreated > BigInt(event.created)) return;
      if (account.stripeSubscription === subscription.id && account.status === 'canceled' && subscription.status !== 'canceled') return;
      const end = subscription.current_period_end ?? subscription.items?.data.find((item) => item.current_period_end)?.current_period_end;
      await tx.billingAccount.update({
        where: { stripeCustomer: customer }, data: {
          stripeSubscription: subscription.id, status: subscription.status,
          currentPeriodEnd: end ? new Date(end * 1000) : null,
          lastEventCreated: BigInt(event.created), updatedAt: new Date(),
        },
      });
    });
  }
}

@Controller()
class BillingController {
  private readonly origin = readConfiguration().APP_ORIGIN;

  constructor(private readonly auth: AuthService, private readonly billingService: Billing) {}

  private async actor(req: Request) {
    if (req.method !== 'GET') checkOrigin(req, this.origin);
    const current = await this.auth.requireSession(sessionCookie(req));
    return { id: current.id, userId: current.userId, email: current.user.email, pendingInvitationId: current.pendingInvitationId };
  }

  @Get('companies/:companyId/billing')
  async state(@Req() req: Request, @Param('companyId') companyId: string) {
    return this.billingService.state(await this.actor(req), parseInput(id, companyId));
  }

  @Post('companies/:companyId/billing/checkout')
  @HttpCode(200)
  async checkout(@Req() req: Request, @Param('companyId') companyId: string) {
    return this.billingService.checkout(await this.actor(req), parseInput(id, companyId), parseInput(id, req.get('Idempotency-Key')));
  }

  @Post('companies/:companyId/billing/portal')
  @HttpCode(200)
  async portal(@Req() req: Request, @Param('companyId') companyId: string) {
    return this.billingService.portal(await this.actor(req), parseInput(id, companyId), parseInput(id, req.get('Idempotency-Key')));
  }

  @Post('billing/webhooks/stripe')
  @HttpCode(204)
  async receive(@Req() req: Request) {
    if (!Buffer.isBuffer(req.body)) throw authenticationFailed();
    await this.billingService.receive(req.body, req.get('Stripe-Signature'));
  }
}

@Module({ imports: [AuthModule], controllers: [BillingController], providers: [Billing] })
export class BillingModule {}
