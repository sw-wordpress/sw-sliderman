/** Built CSS regression for package headings and control alignment; no WordPress writes. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cache = join(homedir(), '.cache/ms-playwright');
const chrome = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name)).sort().pop();
const browser = await chromium.launch({
  executablePath: [join(cache, chrome, 'chrome-linux/chrome'), join(cache, chrome, 'chrome-linux64/chrome')].find(existsSync),
  args: ['--no-sandbox'],
});
const config = {
  restRoot: 'http://sws.test/api/', nonce: 'test', locale: 'en_US', userId: 1, siteId: 1,
  version: 'test', adminUrl: '', fontsOffline: true,
  capabilities: ['sws_edit_sliders', 'sws_import_sliders', 'sws_manage_fonts'],
};
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  assert.equal(url.origin, 'http://sws.test');
  if (url.pathname.startsWith('/build/')) {
    return route.fulfill({
      body: readFileSync(join(root, url.pathname.slice(1))),
      contentType: url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'font/woff2',
    });
  }
  if (url.pathname.startsWith('/api/')) {
    const body = url.pathname.endsWith('/preview')
      ? { token: 'a'.repeat(32), title: 'Package preview', complete: true, conflicts: [], media: [], fonts: [] }
      : url.pathname.endsWith('/cancel') ? { cancelled: true } : [];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  }
  return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><link rel="stylesheet" href="/build/editor/editor.css"></head><body style="margin:0"><div id="sw-sliderman-app"></div><script>window.swsEditorConfig=${JSON.stringify(config)}</script><script type="module" src="/build/editor/editor.js"></script></body></html>` });
});
try {
  mkdirSync(join(root, 'coverage/e2e'), { recursive: true });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://sws.test/#/');
    const heading = page.getByRole('heading', { name: 'Templates and packages', exact: true });
    await heading.waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await heading.evaluate((el) => getComputedStyle(el).fontSize), '16px');
    const card = heading.locator('xpath=ancestor::section');
    assert.ok((await card.boundingBox()).width <= width, 'card fits the viewport');
    assert.ok((await card.locator('.q-file').boundingBox()).width >= 220, 'archive field stays readable when controls wrap');
    await card.screenshot({ path: join(root, `coverage/e2e/package-controls-${width}.png`) });
    if (width === 1440) {
      const field = await card.locator('.q-select').boundingBox();
      const button = await card.getByRole('button', { name: 'Create from template', exact: true }).boundingBox();
      assert.ok(Math.abs(field.y + field.height / 2 - button.y - button.height / 2) <= 1, `field and action are vertically centered: ${JSON.stringify({field,button})}`);
    }
    await page.locator('input[type=file]').setInputFiles({ name: 'fixture.zip', mimeType: 'application/zip', buffer: Buffer.from('PK') });
    await page.getByRole('button', { name: 'Check package', exact: true }).click();
    const preview = page.getByRole('heading', { name: 'Package preview', exact: true });
    await preview.waitFor();
    assert.equal(await preview.evaluate((el) => getComputedStyle(el).fontSize), '16px');
    await card.screenshot({ path: join(root, `coverage/e2e/package-layout-${width}.png`) });
    await page.getByRole('button', { name: 'Cancel import', exact: true }).click();
    await preview.waitFor({ state: 'hidden' });
  }
  assert.deepEqual(errors, []);
  console.log('✓ Package headings remain 16px, controls align, desktop/mobile layouts render correctly.');
} finally {
  await browser.close();
}
