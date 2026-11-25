import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import pg from 'pg';

const here = fileURLToPath(new URL('../', import.meta.url));
const postgres = process.env.TEST_DATABASE_URL ?? 'postgresql://repharbor:repharbor_local@127.0.0.1:5432/repharbor';
const mailpit = 'http://127.0.0.1:8025/api/v1';

export async function until(action, message) {
  let result;
  for (let attempt = 0; attempt < 100; attempt++) {
    result = await action();
    if (result) return result;
    await wait(150);
  }
  throw new Error(message);
}

export async function port() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const selected = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return selected;
}

export function launch(cmd, args, cwd, env) {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let done = false;
  const collect = (chunk) => { output = (output + chunk).slice(-24_000); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const exited = new Promise((resolve) => {
    child.once('error', (error) => { collect(error.message); done = true; resolve(1); });
    child.once('exit', (code) => { done = true; resolve(code); });
  });
  return {
    async finish(expected = 0) {
      assert.equal(await exited, expected, output);
      return output;
    },
    async stop(signal) {
      if (!done) child.kill(signal);
      await exited;
    },
    async ready(url) {
      await until(async () => {
        if (done) throw new Error(output);
        return (await fetch(url).catch(() => null))?.ok;
      }, `Service failed readiness at ${url}\n${output}`);
    },
  };
}

export async function backend(context, { appOrigin, billing = false, stripeOrigin } = {}) {
  const url = new URL(postgres);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Tests require a loopback PostgreSQL instance');
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const sql = new pg.Pool({ connectionString: url.href });
  url.searchParams.set('schema', schema);
  const apiPort = await port();
  const workerPort = await port();
  const origin = `http://localhost:${apiPort}`;
  const app = appOrigin ?? `http://localhost:${await port()}`;
  const env = {
    NODE_ENV: 'test', DATABASE_URL: url.href, APP_ORIGIN: app, API_ORIGIN: origin,
    PORT: String(apiPort), WORKER_HEALTH_PORT: String(workerPort),
    SESSION_TTL_SECONDS: '3600', SECRET_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    MAIL_TRANSPORT: 'smtp', MAIL_FROM: 'login@repharbor.test', SMTP_URL: 'smtp://127.0.0.1:1025',
    SALES_ENVIRONMENT: 'test', ALLOW_LOCAL_PROVIDER_FIXTURES: 'true',
    SALES_RECONCILIATION_INTERVAL_SECONDS: '0',
    BILLING_ENABLED: String(billing), BILLING_ENVIRONMENT: 'test',
    BILLING_STRIPE_KEY: 'sk_test_fixture_placeholder', BILLING_WEBHOOK_SECRET: 'whsec_billingfixture', BILLING_PRICE_ID: 'price_fixture',
  };
  const processes = [];
  context.after(async () => {
    await Promise.all(processes.map((process) => process.stop()));
    await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sql.end();
  });
  await launch(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], here, env).finish();
  const preload = stripeOrigin ? ['--import', './test/stripe-http.mjs'] : [];
  const instanceEnv = { ...env, ...(stripeOrigin && { TEST_STRIPE_ORIGIN: stripeOrigin }) };
  const api = launch(process.execPath, [...preload, 'dist/main.js'], here, instanceEnv);
  processes.push(api);
  let currentWorker;
  async function startWorker(reconcileEverySeconds = 0) {
    const worker = launch(process.execPath, [...preload, 'dist/worker.js'], here, {
      ...instanceEnv, SALES_RECONCILIATION_INTERVAL_SECONDS: String(reconcileEverySeconds),
    });
    currentWorker = worker;
    processes.push(worker);
    await worker.ready(`http://127.0.0.1:${workerPort}/health`);
    return worker;
  }
  await Promise.all([api.ready(origin + '/health'), startWorker()]);
  const operations = (args) => launch(process.execPath, ['dist/operations.js', ...args], here, env);
  return { origin, app, sql, schema, startWorker, stopWorker: (signal) => currentWorker.stop(signal), operations };
}

export async function messages() {
  const response = await fetch(mailpit + '/messages');
  assert.equal(response.status, 200);
  return (await response.json()).messages;
}

export async function emailLink(email, path, before = new Set()) {
  return until(async () => {
    for (const item of await messages()) {
      if (before.has(item.ID) || item.To[0].Address !== email) continue;
      const response = await fetch(mailpit + '/message/' + item.ID);
      const data = await response.json();
      const url = /http:\/\/localhost:\d+\/(?:auth\/confirm|invite)#token=[-\w]+/.exec(data.Text)?.[0];
      if (url && new URL(url).pathname === path) return url;
    }
  }, 'Expected an email in the development inbox');
}

export const token = (link) => new URLSearchParams(new URL(link).hash.substring(1)).get('token');
export const address = (role) => `${role}-${randomUUID()}@repharbor.test`;

export async function call(runtime, cookie, method, path, body, expected = 200, key) {
  const headers = { Origin: runtime.app };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  if (key) headers['Idempotency-Key'] = key;
  const response = await fetch(runtime.origin + '/v1' + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  assert.equal(response.status, expected, `${method} ${path}: ${text}`);
  return { body: text ? JSON.parse(text) : undefined, cookie: response.headers.getSetCookie()?.[0]?.split(';')[0] };
}

export async function requestLink(runtime, email, invitationToken) {
  const before = new Set((await messages()).map(({ ID }) => ID));
  await call(runtime, undefined, 'POST', '/auth/magic-links', { email, invitationToken }, 202);
  return emailLink(email, '/auth/confirm', before);
}

export async function signIn(runtime, email, invitationToken) {
  const link = await requestLink(runtime, email, invitationToken);
  return call(runtime, undefined, 'POST', '/auth/sessions', { token: token(link) });
}
