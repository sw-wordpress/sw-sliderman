/** Built editor lazy-import regression; intercepted local files/API, no WordPress writes. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
const document = JSON.parse(readFileSync(join(root, 'tests/fixtures/documents/valid/effects.json'), 'utf8'));
document.fontRefs = [];
for (const slide of document.slides) {
  slide.background.attachmentId = null;
  for (const layer of slide.layers) layer.style.fontRef = null;
}
const version = '1.2.3+review/test'; // Encoding must preserve the complete central version.
const config = {
  restRoot: 'http://sws.test/api/', nonce: 'test', locale: 'en_US', userId: 1, siteId: 1,
  version, adminUrl: '', capabilities: ['sws_edit_sliders', 'sws_publish_sliders'], fontsOffline: false,
};
const detail = {
  id: 7, title: 'Versioned effects', status: 'unpublished', version: 1, modifiedGmt: '',
  publishedGmt: null, shortcode: '', document, media: {}, published: null, previewUrl: '',
};
const effectDocument = JSON.parse(readFileSync(join(root, 'tests/fixtures/documents/valid/effect.json'), 'utf8'));
effectDocument.fontRefs = [];
for (const slide of effectDocument.slides) {
  slide.background.attachmentId = null;
  for (const layer of slide.layers) {
    layer.style.fontRef = null;
    if (layer.type === 'effect') {
      Object.assign(layer.content, { schemaVersion: 1, params: { count: 500 }, fallbackImageId: null, assets: {} });
    }
  }
}
const particle = JSON.parse(readFileSync(join(root, 'schemas/effects/particle-field.json'), 'utf8'));
config.effects = [{
  type: particle.type, label: particle.label, description: particle.description, category: particle.category,
  continuous: particle.continuous, schemaVersion: particle.schemaVersion, schema: particle.schema,
  presets: particle.presets, assets: particle.assets, module: '/build/gpu/particle-field.js?ver=1', builtin: true,
}];
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const requests = [];
const errors = [];
page.on('request', (request) => requests.push(request.url()));
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
    const body = url.pathname === '/api/sliders/7' ? detail : url.pathname === '/api/sliders/8' ? { ...detail, id: 8, document: effectDocument } : [];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  }
  return route.fulfill({ contentType: 'text/html', body: `<!doctype html><link rel="stylesheet" href="/build/editor/editor.css"><link rel="stylesheet" href="/build/runtime/runtime.css"><div id="sw-sliderman-app"></div><script>window.swsEditorConfig=${JSON.stringify(config)}</script><script type="module" src="/build/editor/editor.js?ver=${encodeURIComponent(version)}"></script>` });
});
try {
  await page.goto('http://sws.test/#/sliders/7');
  await page.locator('.sws-canvas__frame').waitFor();
  assert.equal(requests.filter((url) => url.includes('/heroEffects-')).length, 0, 'effect module stays lazy');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.locator('.sws-light-sweep').waitFor();
  const effectRequests = requests.filter((url) => url.includes('/heroEffects-'));
  assert.equal(effectRequests.length, 1, 'one lazy module request, no unversioned preload');
  assert.equal(new URL(effectRequests[0]).searchParams.get('ver'), version);
  assert.deepEqual(errors, []);
  // The lazy GPU preview chunk is versioned as well (it is only requested for effect layers).
  assert.equal(requests.filter((url) => /\/preview-[\w-]+\.js/.test(url)).length, 0, 'GPU preview stays lazy');
  await page.goto('http://sws.test/#/sliders/8');
  await page.locator('.sws-canvas__frame').waitFor();
  await page.locator('.sws-fx').first().waitFor();
  await page.waitForTimeout(1500);
  const previewRequests = requests.filter((url) => /\/preview-[\w-]+\.js/.test(url));
  assert.ok(previewRequests.length >= 1, 'the GPU preview chunk is requested for an effect layer');
  for (const url of previewRequests) assert.equal(new URL(url).searchParams.get('ver'), version, url);
  console.log('✓ built editor: effects stay lazy and load once with the encoded central plugin version');
} finally {
  await browser.close();
}
