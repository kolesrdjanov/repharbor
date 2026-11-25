import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const pages = [
  ['/', 'A shared statement for sales commissions.'],
  ['/for-sales-reps', 'Your commission agreements in one portfolio'],
  ['/commission-example', 'How a commission balance changes'],
  ['/integrations', 'Revenue integrations'],
  ['/integrations/stripe', 'Stripe commission tracking'],
  ['/integrations/dodo-payments', 'Dodo Payments commission tracking'],
  ['/integrations/whop', 'Whop commission tracking'],
  ['/integrations/revenuecat', 'RevenueCat commission tracking'],
];
const root = fileURLToPath(new URL('../.output/public/', import.meta.url));
const mime = { '.html': 'text/html', '.css': 'text/css', '.xml': 'application/xml', '.txt': 'text/plain', '.woff2': 'font/woff2' };

async function serve(req, res) {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    let path = resolve(root, '.' + decodeURIComponent(pathname));
    if (path !== resolve(root) && !path.startsWith(resolve(root) + sep)) {
      res.writeHead(404).end();
      return;
    }
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' }).end(data);
  } catch {
    res.writeHead(404).end();
  }
}

test('generated pages remain readable without JavaScript, with canonical metadata and public routes only', async (t) => {
  const server = createServer(serve);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const local = `http://127.0.0.1:${server.address().port}`;
  const origin = process.env.NUXT_PUBLIC_SITE_ORIGIN ?? 'https://repharbor.io';
  const appOrigin = process.env.NUXT_PUBLIC_APP_ORIGIN ?? 'https://app.repharbor.io';
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE });
  t.after(() => browser.close());
  const page = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 850 } });
  const descriptions = new Set();
  for (const [path, heading] of pages) {
    const response = await page.goto(local + path);
    assert.equal(response.status(), 200, path);
    const headingElement = page.getByRole('heading', { level: 1, name: heading });
    await headingElement.waitFor();
    assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1, path);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), origin + path);
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    assert.ok(description && !descriptions.has(description));
    descriptions.add(description);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), true, path);
    if (path.startsWith('/integrations/')) assert.equal(await page.getByRole('link', { name: 'Provider documentation' }).isVisible(), true);
    if (path === '/' || path === '/commission-example') {
      assert.equal(await page.getByText('€230.00', { exact: true }).isVisible(), true);
      for (const amount of ['€400.00', '−€150.00', '−€20.00']) {
        assert.equal(await page.getByText(amount, { exact: true }).isVisible(), true, amount);
      }
    }
  }
  await page.goto(local);
  assert.equal(await page.getByRole('link', { name: 'Open RepHarbor' }).getAttribute('href'), appOrigin + '/sign-in');
  const sitemap = await (await fetch(local + '/sitemap.xml')).text();
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(locations, pages.map(([path]) => origin + path));
  const robots = await (await fetch(local + '/robots.txt')).text();
  assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
});
