/** Real multipart upload, staged confirmation, export and offline local resources.
 * Run against an isolated WordPress installation, never a production site:
 * SWS_E2E_URL=http://127.0.0.1:33880 SWS_E2E_USER=... SWS_E2E_PASSWORD=...
 * SWS_E2E_PACKAGE=/tmp/sws-m5-roundtrip.zip node tests/e2e/packages.mjs
 * The input package must contain at least one image and one static local font.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const origin = new URL(process.env.SWS_E2E_URL).origin;
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Use an isolated local test site.');
const archive = process.env.SWS_E2E_PACKAGE;
assert.ok(archive && existsSync(archive), 'A complete image/font package is required.');
const cache = join(homedir(), '.cache/ms-playwright');
const chrome = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name)).sort().pop();
const browser = await chromium.launch({
  executablePath: [join(cache, chrome, 'chrome-linux/chrome'), join(cache, chrome, 'chrome-linux64/chrome')].find(existsSync),
  args: ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, locale: 'en-US' });
await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
const page = await context.newPage();
const ids = [];
const requests = [];
const errors = [];
page.on('request', (request) => requests.push({ url: request.url(), type: request.resourceType() }));
page.on('pageerror', (error) => errors.push(error.stack || error.message));
const admin = `${origin}/wp-admin/admin.php?page=sw-sliderman`;
let config;
async function api(path, body, method = 'POST') {
  return page.evaluate(async ({ config, path, body, method }) => {
    const response = await fetch(config.restRoot + path, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': config.nonce },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    return data;
  }, { config, path, body, method });
}
try {
  await page.goto(`${origin}/wp-login.php`);
  await page.locator('#user_login').fill(process.env.SWS_E2E_USER);
  await page.locator('#user_pass').fill(process.env.SWS_E2E_PASSWORD);
  await page.locator('input[name=redirect_to]').evaluate((input, url) => { input.value = url; }, admin);
  await Promise.all([page.waitForURL('**/wp-admin/**'), page.locator('#wp-submit').click()]);
  await page.goto(admin);
  await page.getByText('Templates and packages', { exact: true }).waitFor();
  config = await page.evaluate(() => window.swsEditorConfig);
  assert.ok(config.capabilities.includes('sws_import_sliders'));
  await page.locator('input[type=file]').setInputFiles(archive);
  await page.getByRole('button', { name: 'Check package', exact: true }).click();
  await page.getByText('Complete package with local resources.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Import as new draft', exact: true }).click();
  await page.waitForURL(/#\/sliders\/\d+/);
  const id = Number(page.url().match(/sliders\/(\d+)/)[1]);
  ids.push(id);
  let detail = await api(`sliders/${id}`, undefined, 'GET');
  assert.equal(detail.published, null);
  assert.ok(detail.document.fontRefs.length > 0);
  assert.ok(Object.keys(detail.media).length > 0);
  await page.locator('.sws-canvas__frame').waitFor();
  mkdirSync('coverage/e2e', { recursive: true });
  await page.screenshot({ path: 'coverage/e2e/m5-import-editor.png' });
  await api(`sliders/${id}/publish`, { version: detail.version });
  await page.goto(detail.previewUrl);
  await page.locator('.sws-slider').waitFor();
  const local = await page.evaluate(async (document) => {
    const font = document.fontRefs[0];
    const faces = await window.document.fonts.load(`${font.style} ${font.weight} 24px "sws-${font.installationId}"`, 'ÄÖÜäöüß €');
    const images = [...window.document.querySelectorAll('.sws-slider img')];
    await Promise.all(images.map((image) => image.decode()));
    return { fonts: faces.length, images: images.length, decoded: images.every((image) => image.naturalWidth > 0) };
  }, detail.document);
  assert.ok(local.fonts > 0, 'Imported local WOFF2 decodes in Chromium.');
  assert.ok(local.images > 0 && local.decoded, 'Imported images decode offline.');
  await page.screenshot({ path: 'coverage/e2e/m5-import-frontend.png' });
  await page.goto(admin);
  const exportResult = await api('packages/export', { id, includeFiles: true });
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate((url) => { window.location.assign(url); }, exportResult.url);
  const download = await downloadPromise;
  await download.saveAs('coverage/e2e/m5-export.zip');
  assert.equal(await download.failure(), null);
  // Explicitly return to the list after the download navigation.
  await page.goto(admin + '#/');
  await page.getByText('Templates and packages', { exact: true }).waitFor();
  // Upload the just-downloaded ZIP, then cancel: no additional slider is created.
  await page.locator('input[type=file]').setInputFiles('coverage/e2e/m5-export.zip');
  await page.getByRole('button', { name: 'Check package', exact: true }).click();
  await page.getByText('Complete package with local resources.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cancel import', exact: true }).click();
  await page.getByText('Complete package with local resources.', { exact: true }).waitFor({ state: 'hidden' });
  // All local templates use exactly the same validated takeover path.
  for (const template of ['image-slider', 'text-hero', 'event']) {
    const created = await api(`templates/${template}`, {});
    ids.push(created.id);
    detail = await api(`sliders/${created.id}`, undefined, 'GET');
    assert.equal(detail.published, null);
  }
  assert.deepEqual(errors, []);
  const fontRequests = requests.filter((request) => request.type === 'font' || /\.woff2(?:\?|$)/.test(request.url));
  assert.ok(fontRequests.length > 0);
  assert.ok(fontRequests.every((request) => new URL(request.url).origin === origin));
  console.log('✓ M5: real ZIP upload, staged confirmation/cancellation, private download, three templates, decoded images/local fonts and offline frontend');
} catch (error) {
  console.error('Plugin page errors:', errors);
  await page.screenshot({ path: 'coverage/e2e/m5-error.png' });
  throw error;
} finally {
  if (config) {
    await page.goto(admin);
    for (const id of ids) {
      await api(`sliders/${id}`, undefined, 'DELETE');
      await api(`sliders/${id}/purge`, {});
    }
  }
  await browser.close();
}
