import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { address, backend, call, signIn, until } from './harness.mjs';
import { scenario, sendStripe } from './scenario.mjs';

async function stripeServer(t, respond) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    let body = '';
    for await (const chunk of request) body += chunk;
    const params = new URLSearchParams(body);
    requests.push({ url, params, headers: request.headers });
    const data = respond({ url, params, headers: request.headers });
    if (data === undefined) return; // The interruption test holds a page until the worker dies.
    const status = data === null ? 404 : 200;
    response.writeHead(status, { 'Content-Type': 'application/json', 'Request-Id': 'req_fixture' });
    response.end(JSON.stringify(data ?? { error: { message: 'Unrecognized fixture request' } }));
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
  return { origin: `http://127.0.0.1:${server.address().port}`, requests };
}

test('a checkpointed Stripe import resumes after worker interruption and agrees with uninterrupted processing', { timeout: 90_000 }, async (t) => {
  const sources = new Map();
  const stripe = await stripeServer(t, ({ url, headers }) => {
    const source = sources.get(headers.authorization);
    if (!source) return null;
    if (url.pathname === '/v1/account') return { id: source.account };
    if (url.pathname !== '/v1/events') return null;
    const cursor = url.searchParams.get('starting_after');
    if (cursor && source.holdSecondPage) return undefined;
    const from = Number(url.searchParams.get('created[gte]'));
    const to = Number(url.searchParams.get('created[lt]'));
    const events = source.events.filter(({ created }) => created >= from && created < to);
    return { object: 'list', data: cursor ? events.slice(1) : events.slice(0, 1), has_more: !cursor && events.length > 1 };
  });
  const runtime = await backend(t, { stripeOrigin: stripe.origin });
  const now = Math.floor(Date.now() / 1_000);
  const timestamp = (seconds) => new Date(seconds * 1_000).toISOString();
  const window = { start: timestamp(now - 1200), end: timestamp(now - 120) };
  const job = async (id) => (await runtime.sql.query(
    `SELECT state, args FROM "${runtime.schema}".job WHERE id = $1`, [id],
  )).rows[0];
  const done = async (id) => until(async () => {
    const current = await job(id);
    assert.notEqual(current.state, 'failed', 'Backfill failed');
    return current.state === 'done';
  }, 'Backfill did not finish');

  const statements = [];
  const cases = [];
  for (const name of ['control', 'interrupted']) {
    const account = `acct_fixture_${name}`;
    const key = `sk_test_${name}`;
    const interrupted = name === 'interrupted';
    const source = { account, holdSecondPage: interrupted, events: [] };
    sources.set(`Bearer ${key}`, source);
    const fixture = await scenario(runtime, { stripeAccount: account, stripeKey: key });
    const connection = `${fixture.co}/connections/${fixture.connection.id}`;
    const [original] = fixture.invoices;
    const renewal = {
      ...original, id: 'evt_import_renewal', created: now - 300,
      data: { object: {
        ...original.data.object, id: 'in_fixture_renewal',
        status_transitions: { paid_at: now - 300 },
        payments: { has_more: false, data: [{ status: 'paid', amount_paid: 20_000,
          payment: { type: 'payment_intent', payment_intent: 'pi_fixture_renewal' } }] },
      } },
    };
    const refund = { ...fixture.refund, created: now - 240 };
    source.events = [renewal, refund];
    await call(runtime, fixture.founder, 'POST', `${fixture.eng}/payments`, fixture.payment, 201, randomUUID());
    const repair = { start: timestamp(now - 1800), end: timestamp(now - 60) };
    if (interrupted) {
      await runtime.sql.query(`INSERT INTO "${runtime.schema}".coverage_gap (connection_id, starts_at, ends_at, reason)
        VALUES ($1, $2, $3, 'IMPORT_FAILED')`, [fixture.connection.id, repair.start, repair.end]);
      await runtime.sql.query(`INSERT INTO "${runtime.schema}".job (kind, dedupe_key, args, state, last_error_code)
        VALUES ('provider_backfill', $1, $2, 'failed', 'IMPORT_FAILED')`,
      ['failed-import-fixture', { ...repair, connectionId: fixture.connection.id }]);
    }
    const importKey = randomUUID();
    const importJob = (await call(runtime, fixture.founder, 'POST', connection + '/backfills', window, 202, importKey)).body.jobId;
    const retry = await call(runtime, fixture.founder, 'POST', connection + '/backfills', window, 202, importKey);
    assert.equal(retry.body.jobId, importJob);
    if (interrupted) {
      const secondPage = ({ url, headers }) => headers.authorization === `Bearer ${key}`
        && url.searchParams.get('starting_after') === renewal.id;
      await until(() => stripe.requests.some(secondPage), 'Worker did not checkpoint its first page');
      assert.equal((await job(importJob)).args.cursor, renewal.id);
      await runtime.stopWorker('SIGKILL');
      await sendStripe(runtime, fixture.webhook, renewal);
      await sendStripe(runtime, fixture.webhook, refund);
      await call(runtime, fixture.founder, 'POST', connection + '/backfills', window, 409, randomUUID());
      // Advance the expired lease without a 90-second test delay.
      await runtime.sql.query(`UPDATE "${runtime.schema}".job SET lease_until = now() WHERE id = $1`, [importJob]);
      source.holdSecondPage = false;
      await runtime.startWorker();
      await until(() => stripe.requests.filter(secondPage).length === 2, 'Worker did not resume at its saved cursor');
    }
    await done(importJob);
    const path = `${fixture.eng}/statement?asOf=${encodeURIComponent(timestamp(now + 70 * 86_400))}`;
    const statement = (await call(runtime, fixture.rep, 'GET', path)).body;
    assert.deepEqual((await call(runtime, fixture.founder, 'GET', path)).body, statement);
    assert.equal(statement.balances[0].outstandingMinor, '27000');
    assert.equal(statement.coverageIncomplete, interrupted ? true : undefined);
    statements.push(statement.entries.items.map(({ kind, currency, deltaMinor }) => [kind, currency, deltaMinor]).sort());
    if (interrupted) {
      const gaps = (await call(runtime, fixture.founder, 'GET', connection + '/coverage')).body.items;
      const remaining = gaps.filter((gap) => !gap.resolvedAt).map(({ startsAt, endsAt }) => [startsAt, endsAt]).sort();
      assert.deepEqual(remaining, [[timestamp(now - 1800), timestamp(now - 1200)], [timestamp(now - 120), timestamp(now - 60)]]);
      assert.equal(gaps.filter((gap) => gap.resolvedAt).length, 1);
      assert.equal(JSON.parse(await runtime.operations(['check-sales']).finish(1)).issues[0].kind, 'provider_backfill');
      const repaired = await call(runtime, fixture.founder, 'POST', connection + '/backfills', repair, 202, randomUUID());
      await done(repaired.body.jobId);
      assert.equal((await call(runtime, fixture.rep, 'GET', path)).body.coverageIncomplete, undefined);
    }
    cases.push({ fixture, path });
  }
  assert.deepEqual(statements[0], statements[1]);

  const [control, interrupted] = cases;
  const jobs = await runtime.sql.query(`UPDATE "${runtime.schema}".job j SET state = 'failed'
    FROM "${runtime.schema}".inbound_event e
    WHERE j.dedupe_key = 'normalize-sale:' || e.id::text AND e.external_event = 'evt_import_renewal'
    RETURNING j.id, e.connection_id`);
  const check = JSON.parse(await runtime.operations(['check-sales']).finish(1));
  assert.equal(check.issues.find(({ state }) => state === 'failed').count, 2);
  const replay = ['replay-range', interrupted.fixture.connection.id, window.start, window.end, 'Fixture provider recovered'];
  assert.equal(JSON.parse(await runtime.operations(replay).finish()).requeued, 1);
  const replayed = jobs.rows.find(({ connection_id }) => connection_id === interrupted.fixture.connection.id);
  const other = jobs.rows.find(({ connection_id }) => connection_id === control.fixture.connection.id);
  await done(replayed.id);
  assert.equal((await job(other.id)).state, 'failed');
  const audit = await runtime.sql.query(`SELECT details FROM "${runtime.schema}".audit_event
    WHERE subject_id = $1 AND action = 'operator_replay'`, [replayed.id]);
  assert.equal(audit.rows[0].details.reason, 'Fixture provider recovered');
  await runtime.operations(['replay', control.fixture.connection.id, other.id, 'Fixture control recovered']).finish();
  await done(other.id);
  assert.deepEqual(JSON.parse(await runtime.operations(['check-sales']).finish()).issues, []);
  assert.equal((await call(runtime, interrupted.fixture.rep, 'GET', interrupted.path)).body.balances[0].outstandingMinor, '27000');

  // Start a fresh worker with periodic reconciliation enabled on the existing connections.
  await runtime.stopWorker();
  await runtime.startWorker(86_400);
  await until(async () => {
    const { rows } = await runtime.sql.query(`SELECT state, args FROM "${runtime.schema}".job
      WHERE kind = 'provider_backfill' AND dedupe_key LIKE 'backfill:%:scheduled:%'`);
    if (rows.length !== 2 || rows.some(({ state }) => state !== 'done')) return false;
    for (const { args } of rows) {
      const expected = args.connectionId === interrupted.fixture.connection.id ? timestamp(now - 1800) : window.start;
      assert.equal(args.start, expected);
    }
    return true;
  }, 'Scheduled reconciliation did not complete');
  assert.equal((await call(runtime, interrupted.fixture.rep, 'GET', interrupted.path)).body.balances[0].outstandingMinor, '27000');
});

test('Stripe Billing uses the separate platform account for founder checkout and portal', async (t) => {
  const stripe = await stripeServer(t, ({ url }) => {
    if (url.pathname === '/v1/customers') return { id: 'cus_platform_loopback' };
    if (url.pathname === '/v1/checkout/sessions') return { url: 'https://checkout.stripe.test/session' };
    if (url.pathname === '/v1/billing_portal/sessions') return { url: 'https://billing.stripe.test/session' };
    return null;
  });
  const runtime = await backend(t, { billing: true, stripeOrigin: stripe.origin });
  const founder = (await signIn(runtime, address('billing-founder'))).cookie;
  const outsider = (await signIn(runtime, address('billing-outsider'))).cookie;
  const company = (await call(runtime, founder, 'POST', '/companies', { name: 'Billing fixture', timeZone: 'Europe/Belgrade' }, 201)).body;
  const billing = `/companies/${company.id}/billing`;
  const key = randomUUID();
  await call(runtime, outsider, 'POST', billing + '/checkout', undefined, 404, key);
  await call(runtime, outsider, 'POST', billing + '/portal', undefined, 404, key);
  assert.equal(stripe.requests.length, 0);
  const checkout = await call(runtime, founder, 'POST', billing + '/checkout', undefined, 200, key);
  assert.equal(checkout.body.url, 'https://checkout.stripe.test/session');
  await call(runtime, founder, 'POST', billing + '/checkout', undefined, 200, key);
  const portal = await call(runtime, founder, 'POST', billing + '/portal', undefined, 200, randomUUID());
  assert.equal(portal.body.url, 'https://billing.stripe.test/session');
  const [customer, first, retry, portalRequest] = stripe.requests;
  assert.equal(customer.params.get('metadata[purpose]'), 'repharbor_platform_subscription');
  assert.equal(first.params.get('line_items[0][price]'), 'price_fixture');
  assert.equal(first.params.get('customer'), 'cus_platform_loopback');
  assert.equal(first.headers['idempotency-key'], retry.headers['idempotency-key']);
  assert.equal(portalRequest.params.get('return_url'), runtime.app + billing);
  assert.ok(stripe.requests.every(({ headers }) => headers.authorization === 'Bearer sk_test_fixture_placeholder'));
});
