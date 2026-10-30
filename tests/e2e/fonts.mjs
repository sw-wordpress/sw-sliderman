/** Built editor + native WOFF2 decoding, intercepted REST; no WordPress writes or provider calls. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cache = join(homedir(), '.cache/ms-playwright');
const chrome = readdirSync(cache)
  .filter((name) => /^chromium-\d+$/.test(name))
  .sort()
  .pop();
const browser = await chromium.launch({
  executablePath: join(cache, chrome, 'chrome-linux/chrome'),
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const requests = [];
const errors = [];
page.on('request', (request) => requests.push(request.url()));
page.on('pageerror', (error) => errors.push(error.message));
const family = {
  id: 'lato',
  family: 'Lato',
  category: 'sans-serif',
  license: 'OFL',
  static: true,
  subsets: ['latin', 'latin-ext'],
  variants: [{ weight: 400, style: 'normal' }],
  installed: false,
};
const installation = {
  id: 'localtest-123',
  familyId: 'localtest',
  family: 'Imported Lato',
  category: 'custom',
  variants: [{ weight: 400, style: 'normal', subsets: ['latin'] }],
  stylesheetUrl: 'http://sws.test/font.css',
  licenseId: 'OFL-1.1',
  licenseUrl: 'http://sws.test/license.txt',
  installedGmt: '2026-10-31 10:00:00',
  filesPresent: true,
  originMismatch: false,
  inUse: false,
};
let offline = false;
let imported = false;
let importBody;
let job = null;
const fontCss = `@font-face{font-family:'sws-localtest-123';font-style:normal;font-weight:400;font-display:swap;src:url('/latin.woff2') format('woff2');unicode-range:U+0000-00FF,U+20AC;}@font-face{font-family:'sws-localtest-123';font-style:normal;font-weight:400;font-display:swap;src:url('/latin-ext.woff2') format('woff2');unicode-range:U+0100-024F,U+0300-036F;}`;
await page.route('**/*', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  assert.equal(url.origin, 'http://sws.test', `Foreign browser origin: ${url}`);
  const path = url.pathname;
  const json = (body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (path.startsWith('/build/')) {
    const file = join(root, path.slice(1));
    return route.fulfill({
      body: readFileSync(file),
      contentType: path.endsWith('.js')
        ? 'text/javascript'
        : path.endsWith('.css')
          ? 'text/css'
          : 'font/woff2',
    });
  }
  if (path === '/api/fonts/catalog')
    return json({ catalogVersion: 'test', offline, families: [family] });
  if (path === '/api/fonts') return json(imported ? [installation] : []);
  if (path === '/api/fonts/settings') {
    offline = request.postDataJSON().offline;
    return json({ offline });
  }
  if (path === '/api/fonts/import') {
    importBody = request.postDataJSON();
    imported = true;
    return json({ id: installation.id }, 201);
  }
  if (path === '/api/fonts/jobs' && request.method() === 'POST') {
    job = {
      id: '00000000-0000-4000-8000-000000000001',
      kind: request.postDataJSON().kind,
      familyId: null,
      state: 'queued',
      result: null,
      error: null,
      updatedGmt: '2026-10-31 10:00:00',
    };
    return json(job, 202);
  }
  if (path === '/api/fonts/jobs') return json(job ? [job] : []);
  if (path.endsWith('/run')) {
    job.state = 'completed';
    job.result = 'new-catalog';
    return json(job);
  }
  if (path === '/font.css') return route.fulfill({ contentType: 'text/css', body: fontCss });
  if (path.endsWith('.woff2'))
    return route.fulfill({
      contentType: 'font/woff2',
      body: readFileSync(
        join(
          root,
          `tests/fixtures/fonts/lato-400-${path.includes('ext') ? 'latin-ext' : 'latin'}.woff2`,
        ),
      ),
    });
  if (path === '/frontend')
    return route.fulfill({
      contentType: 'text/html',
      body: `<style>${fontCss}</style><p style="font-family:'sws-localtest-123';font-synthesis:none">ÄÖÜäöüß € Āā Čč ä</p>`,
    });
  const config = {
    restRoot: 'http://sws.test/api/',
    nonce: 'fixture',
    locale: 'en_US',
    capabilities: ['sws_manage_fonts', 'sws_edit_sliders'],
  };
  return route.fulfill({
    contentType: 'text/html',
    body: `<html><head><link rel="stylesheet" href="/build/editor/editor.css"></head><body><div id="sw-sliderman-app"></div><script>window.swsEditorConfig=${JSON.stringify(config)}</script><script type="module" src="/build/editor/editor.js"></script></body></html>`,
  });
});
try {
  await page.goto('http://sws.test/#/fonts');
  await page.getByRole('heading', { name: 'Fonts', exact: true }).waitFor();
  await page.getByRole('switch', { name: 'Offline mode', exact: true }).click();
  await page.waitForFunction(() =>
    document.body.textContent.includes('Offline mode blocks new server downloads.'),
  );
  assert.equal(offline, true);
  await page.getByRole('button', { name: 'Import WOFF2', exact: true }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles(join(root, 'tests/fixtures/fonts/lato-400-latin.woff2'));
  await page.getByLabel('Family', { exact: true }).fill('Imported Lato');
  await page
    .getByLabel('License text', { exact: true })
    .fill(readFileSync(join(root, 'tests/fixtures/fonts/OFL-Lato.txt'), 'utf8'));
  await page.getByRole('button', { name: 'Import locally', exact: true }).click();
  await page.getByText('Imported Lato', { exact: true }).waitFor();
  assert.equal(importBody.family, 'Imported Lato');
  assert.equal(Buffer.from(importBody.fileBase64, 'base64').subarray(0, 4).toString(), 'wOF2');
  const decoded = await page.evaluate(async () => {
    await document.fonts.load('400 24px "sws-localtest-123"', 'ÄÖÜäöüß € Āā Čč a\u0308');
    return [...document.fonts]
      .filter((face) => face.family.includes('sws-localtest-123'))
      .map((face) => face.status);
  });
  assert.deepEqual(decoded, ['loaded', 'loaded']);
  await page.getByRole('switch', { name: 'Offline mode', exact: true }).click();
  await page.getByRole('button', { name: 'Update catalog', exact: true }).click();
  await page.getByText(/Catalog update · Completed/).waitFor();
  assert.equal(job.state, 'completed');
  assert.ok(requests.some((url) => url.endsWith('/latin.woff2')));
  assert.ok(requests.some((url) => url.endsWith('/latin-ext.woff2')));
  await page.goto('http://sws.test/frontend');
  assert.equal(
    await page.evaluate(
      async () =>
        (await document.fonts.load('400 24px "sws-localtest-123"', 'ÄÖÜäöüß € Āā')).length,
    ),
    2,
  );
  assert.deepEqual(errors, []);
  console.log(
    '✓ Font UI: offline setting, licensed local import, catalog job, real Latin/Extended glyph decoding; all requests same origin.',
  );
} finally {
  await browser.close();
}
