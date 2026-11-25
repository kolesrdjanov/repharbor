import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { backend, emailLink, launch, messages, port, until } from '../../api/test/harness.mjs';
import { scenario, sendStripe } from '../../api/test/scenario.mjs';

async function signIn(browser, page, target, email, scan = false) {
  await page.goto(target);
  const before = new Set((await messages()).map(({ ID }) => ID));
  const emailField = page.getByLabel('Email address');
  await emailField.fill(email);
  await emailField.press('Enter');
  await page.getByRole('heading', { name: 'Check your email' }).waitFor();
  const link = await emailLink(email, '/auth/confirm', before);
  if (scan) {
    const reader = await browser.newContext();
    try {
      const scanner = await reader.newPage();
      await scanner.goto(link);
      await scanner.getByRole('heading', { name: 'Confirm sign-in' }).waitFor();
      assert.equal((await reader.cookies()).length, 0);
    } finally {
      await reader.close();
    }
  }
  await page.goto(link);
  const confirm = page.getByRole('button', { name: 'Confirm sign-in' });
  await confirm.waitFor();
  assert.equal(new URL(page.url()).hash, '');
  await confirm.press('Enter');
  await page.getByRole('heading', { name: 'Commission statement' }).waitFor();
}

test('independent founder and rep sessions, payment recovery, matching statements, and logout', { timeout: 90_000 }, async (context) => {
  const appPort = await port();
  const appOrigin = `http://localhost:${appPort}`;
  const runtime = await backend(context, { appOrigin });
  const fixture = await scenario(runtime);
  const appDir = fileURLToPath(new URL('../', import.meta.url));
  const app = launch(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(appPort), '--strictPort'],
    appDir, { VITE_API_ORIGIN: runtime.origin });
  context.after(() => app.stop());
  await app.ready(appOrigin);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE });
  context.after(() => browser.close());
  const founder = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const rep = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const target = appOrigin + fixture.eng + '/statement';

  await signIn(browser, founder, target, fixture.founderEmail, true);
  await signIn(browser, rep, target, fixture.repEmail);
  await rep.reload();
  await rep.getByText('€400.00', { exact: true }).first().waitFor();
  assert.equal(await rep.getByRole('button', { name: 'Record external payment' }).count(), 0);
  assert.equal(await rep.evaluate(() => document.documentElement.scrollWidth === innerWidth), true);

  const open = founder.getByRole('button', { name: 'Record external payment' });
  await open.press('Enter');
  await founder.getByRole('dialog', { name: 'Record external payment' }).waitFor();
  await founder.keyboard.press('Escape');
  await founder.getByRole('dialog', { name: 'Record external payment' }).waitFor({ state: 'hidden' });
  await until(() => open.evaluate((element) => document.activeElement === element), 'Payment dialog did not return focus');
  await open.click();
  await founder.getByLabel('Amount', { exact: true }).fill('150.00');
  await founder.getByLabel('Date paid').fill(fixture.payment.paidOn);
  await founder.getByLabel('Reference (optional)').fill(fixture.payment.reference);

  const requests = [];
  const paymentRequest = runtime.origin + '/v1' + fixture.eng + '/payments';
  await founder.route(paymentRequest, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    requests.push(route.request().headers()['idempotency-key']);
    if (requests.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await founder.getByRole('button', { name: 'Save payment' }).click();
  await founder.getByRole('alert').getByText('The app could not reach RepHarbor. Try again.').waitFor();
  await founder.getByRole('button', { name: 'Save payment' }).click();
  await founder.getByText('Payment recorded.').waitFor();
  assert.equal(requests.length, 2);
  assert.equal(requests[0], requests[1]);

  await sendStripe(runtime, fixture.webhook, fixture.refund);
  await until(async () => {
    await founder.getByRole('button', { name: 'Refresh statement' }).click();
    return founder.getByText('€230.00', { exact: true }).isVisible();
  }, 'Founder statement did not reflect the refund');
  await rep.getByRole('button', { name: 'Refresh statement' }).click();
  await rep.getByText('€230.00', { exact: true }).waitFor();
  for (const page of [founder, rep]) {
    await page.getByRole('link', { name: 'Refund adjustment' }).click();
    await page.getByText('-€20.00', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'View related entry' }).click();
    await page.getByText('20%', { exact: true }).waitFor();
  }
  const signInHeading = rep.getByRole('heading', { name: 'Sign in to RepHarbor' });
  await rep.getByRole('button', { name: 'Sign out' }).click();
  await signInHeading.waitFor();
  await rep.goto(target);
  await signInHeading.waitFor();
});
