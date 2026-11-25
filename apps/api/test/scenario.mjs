import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { address, call, emailLink, signIn, token, until } from './harness.mjs';

const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString();
const secret = 'whsec_stripefixture';

export async function sendStripe(runtime, pathname, event, signingSecret = secret, expected = 204) {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const hash = createHmac('sha256', signingSecret).update(`${timestamp}.${payload}`).digest('hex');
  const response = await fetch(`${runtime.origin}/v1/${pathname}`, {
    method: 'POST', body: payload, headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${timestamp},v1=${hash}` },
  });
  assert.equal(response.status, expected, await response.text());
}

export async function scenario(runtime, { earlyRefund = false } = {}) {
  const founderEmail = address('founder');
  const repEmail = address('rep');
  const founder = (await signIn(runtime, founderEmail)).cookie;
  const company = (await call(runtime, founder, 'POST', '/companies', { name: 'Konvuno fixture', timeZone: 'Europe/Belgrade' }, 201)).body;
  const co = `/companies/${company.id}`;
  const product = (await call(runtime, founder, 'POST', `${co}/products`, { name: 'Fixture product' }, 201)).body;
  const terms = {
    basis: 'collected_ex_tax_before_fees', rateBps: 2000, accrualMode: 'recurring', eligibilityMonths: 12,
    refundPolicy: 'reverse_original_rate', cadence: 'monthly', dueDay: 10, timeZone: company.timeZone, effectiveAt: daysAgo(28),
  };
  const invited = (await call(runtime, founder, 'POST', `${co}/invitations`, { email: repEmail, productId: product.id, terms }, 201, randomUUID())).body;
  const invitation = await emailLink(repEmail, '/invite');
  const repSignIn = await signIn(runtime, repEmail, token(invitation));
  const rep = repSignIn.cookie;
  const handoff = { invitationId: repSignIn.body.pendingInvitationId };
  const preview = await call(runtime, rep, 'POST', '/invitations/preview', handoff);
  assert.equal(preview.body.terms.rateBps, 2000);
  const accepted = (await call(runtime, rep, 'POST', '/invitations/accept', handoff)).body;
  assert.equal(invited.engagementId, accepted.id);
  const eng = `/engagements/${accepted.id}`;
  const [draft] = (await call(runtime, rep, 'GET', `${eng}/agreements`)).body.items;
  await call(runtime, rep, 'POST', `${eng}/agreements/${draft.id}/accept`, { revision: draft.revision });
  const account = `acct_fixture_${randomUUID().replaceAll('-', '')}`;
  const connection = (await call(runtime, founder, 'POST', `${co}/connections`, {
    provider: 'stripe', environment: 'test', externalAccount: account, credentials: { webhookSecret: secret },
  }, 201)).body;
  await call(runtime, founder, 'PUT', `${co}/connections/${connection.id}/mappings`, {
    items: [{ productId: product.id, externalProduct: 'prod_fixture', channel: 'web', authoritative: true }],
  });

  const stamp = (offset) => Math.floor(Date.parse(daysAgo(offset)) / 1000);
  const event = (id, type, object) => ({
    id, object: 'event', type, livemode: false, account, created: stamp(0), data: { object },
  });
  const refund = event('evt_refund', 'refund.created', {
    id: 're_fixture', status: 'succeeded', amount: 10_000, currency: 'eur', payment_intent: 'pi_fixture_1', created: stamp(1),
  });
  const webhook = `webhooks/stripe/${connection.id}`;
  if (earlyRefund) await sendStripe(runtime, webhook, refund);

  const claims = new Map();
  for (let index = 1; index <= 10; index++) {
    const customerLabel = `Reference customer ${index}`;
    const claim = (await call(runtime, rep, 'POST', `${eng}/claims`, { customerLabel, contactEmail: `contact${index}@fixture.test` }, 201)).body;
    await call(runtime, founder, 'POST', `${eng}/claims/${claim.id}/decision`, { decision: 'approved' });
    const customer = `cus_fixture_${index}`;
    claims.set(customer, claim.id);
    const invoice = event(`evt_fixture_${index}`, 'invoice.paid', {
      id: `in_fixture_${index}`, status: 'paid', customer, customer_email: 'different-payer@fixture.test', currency: 'eur', amount_paid: 20_000,
      status_transitions: { paid_at: stamp(20 - index) },
      lines: { has_more: false, data: [{ id: 'il_1', amount: 20_000, subtotal: 20_000, discount_amounts: [], taxes: [],
        currency: 'eur', pricing: { price_details: { product: 'prod_fixture' } } }] },
      payments: { has_more: false, data: [{ status: 'paid', amount_paid: 20_000,
        payment: { type: 'payment_intent', payment_intent: `pi_fixture_${index}` } }] },
    });
    if (index === 1) {
      await sendStripe(runtime, webhook, invoice, 'whsec_wrong', 401);
      await sendStripe(runtime, webhook, { ...invoice, livemode: true }, secret, 403);
      await Promise.all([sendStripe(runtime, webhook, invoice), sendStripe(runtime, webhook, invoice)]);
      await sendStripe(runtime, webhook, { ...invoice, id: 'evt_fixture_1_import' });
    } else {
      await sendStripe(runtime, webhook, invoice);
    }
  }
  const items = await until(async () => {
    const review = (await call(runtime, founder, 'GET', `${co}/review?limit=100`)).body.items;
    return review.length === 10 && review;
  }, 'Expected the ten sales in review');
  for (const row of items) {
    await call(runtime, founder, 'POST', `${co}/review/${row.id}/resolve`, {
      action: 'assign_claim', claimId: claims.get(row.customerLabel), reason: 'Confirmed different payer account.',
    }, 200, randomUUID());
  }
  const opening = (await call(runtime, founder, 'POST', `${eng}/opening-balances`, {
    currency: 'EUR', amountMinor: '0', asOf: daysAgo(27).slice(0, 10), note: 'Fixture opening balance',
  }, 201, randomUUID())).body;
  await call(runtime, rep, 'POST', `${eng}/opening-balances/${opening.id}/accept`, undefined, 200, randomUUID());
  return { co, eng, company, founder, rep, founderEmail, repEmail, webhook, refund, payment: {
    currency: 'EUR', amountMinor: '15000', paidOn: daysAgo(3).slice(0, 10), reference: 'External fixture payment',
  } };
}
