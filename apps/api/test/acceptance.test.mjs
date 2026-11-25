import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { address, backend, call, requestLink, signIn, token, until } from './harness.mjs';
import { scenario, sendStripe } from './scenario.mjs';

test('magic links are single use, including simultaneous confirmation', async (t) => {
  const runtime = await backend(t);
  const link = await requestLink(runtime, address('auth'));
  const endpoint = runtime.origin + '/v1/auth/sessions';
  const headers = { Origin: runtime.app, 'Content-Type': 'application/json' };
  const body = JSON.stringify({ token: token(link) });
  const responses = await Promise.all([fetch(endpoint, { method: 'POST', headers, body }), fetch(endpoint, { method: 'POST', headers, body })]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 410]);
  const cookie = responses.find(({ status }) => status === 200).headers.getSetCookie()[0].split(';')[0];
  await call(runtime, cookie, 'GET', '/auth/session');
  await call(runtime, cookie, 'DELETE', '/auth/session', undefined, 204);
  await call(runtime, cookie, 'GET', '/auth/session', undefined, 401);
});

test('verified Stripe input, tenant isolation, out-of-order refund, and replayed external payment', async (t) => {
  const runtime = await backend(t, { billing: true });
  const s = await scenario(runtime, { earlyRefund: true });
  const outsider = (await signIn(runtime, address('other-founder'))).cookie;
  const asOf = new Date(Date.now() + 70 * 86_400_000).toISOString();
  const path = `${s.eng}/statement?asOf=${encodeURIComponent(asOf)}`;
  await call(runtime, outsider, 'GET', path, undefined, 404);
  await call(runtime, s.rep, 'GET', `${s.co}/review`, undefined, 404);
  const key = randomUUID();
  const payments = await Promise.all([
    call(runtime, s.founder, 'POST', `${s.eng}/payments`, s.payment, 201, key),
    call(runtime, s.founder, 'POST', `${s.eng}/payments`, s.payment, 201, key),
  ]);
  assert.equal(payments[0].body.id, payments[1].body.id);
  await call(runtime, s.rep, 'POST', `${s.eng}/payments`, s.payment, 403, randomUUID());
  await call(runtime, s.founder, 'POST', `${s.eng}/payments`, { ...s.payment, amountMinor: '1' }, 409, key);
  await sendStripe(runtime, s.webhook, s.refund);
  await sendStripe(runtime, s.webhook, { ...s.refund, id: 'evt_refund_import' });
  const expected = { currency: 'EUR', accruedMinor: '38000', recordedPaymentsMinor: '15000',
    outstandingMinor: '23000', dueMinor: '23000', openingStatus: 'known' };
  const founder = await until(async () => {
    const current = (await call(runtime, s.founder, 'GET', path)).body;
    return current.balances[0]?.outstandingMinor === '23000' && current;
  }, 'Expected an outstanding balance of 23000');
  const rep = (await call(runtime, s.rep, 'GET', path)).body;
  assert.deepEqual(founder.balances, [expected]);
  assert.deepEqual(rep, founder);
  assert.equal(rep.entries.items.filter(({ kind }) => kind === 'refund').length, 1);

  const stripeCustomer = 'cus_platform_fixture';
  await runtime.sql.query(`INSERT INTO "${runtime.schema}".billing_account
    (company_id, environment, stripe_customer, status, updated_at)
    VALUES ($1, 'test', $2, 'not_started', now())`, [s.company.id, stripeCustomer]);
  const billingEvent = { id: 'evt_platform', object: 'event', type: 'customer.subscription.updated',
    created: Math.floor(Date.now() / 1000), livemode: false,
    data: { object: { id: 'sub_platform', customer: stripeCustomer, status: 'active' } },
  };
  await sendStripe(runtime, 'billing/webhooks/stripe', billingEvent, 'whsec_billingfixture');
  await sendStripe(runtime, 'billing/webhooks/stripe', billingEvent, 'whsec_billingfixture');
  assert.equal((await call(runtime, s.founder, 'GET', `${s.co}/billing`)).body.status, 'active');
  await call(runtime, s.rep, 'GET', `${s.co}/billing`, undefined, 404);
  assert.deepEqual((await call(runtime, s.rep, 'GET', path)).body.balances, [expected]);
});
