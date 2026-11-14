/**
 * Editor preview vs published frontend (M3.24), against the local development WordPress
 * (not part of CI): the reference document (tests/fixtures/documents/valid/basic.json without
 * images and fonts) is published and measured at a desktop, tablet and mobile container width.
 *
 * Tolerance (documented in docs/testing.md): layer boxes may differ by 1 px + 0.5 % of the
 * container width, font sizes by 0.6 px (browser rounding of cqw units and sub-pixel layout).
 * Usage: node tests/e2e/parity.mjs [screenshot-dir]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2] ?? join(here, '../../coverage/e2e-parity');
mkdirSync(shots, { recursive: true });
const helper = (...args) => JSON.parse(execFileSync('php', [join(here, 'wp-helper.php'), ...args], { encoding: 'utf8' }));
const chrome = () => {
  const base = join(homedir(), '.cache/ms-playwright');
  const dir = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return join(base, dir, 'chrome-linux/chrome');
};
const TOLERANCE_PX = 1;
const TOLERANCE_RATIO = 0.001;
const TOLERANCE_FONT_PX = 0.6;
const WIDTHS = [
  { name: 'desktop', width: 1180 },
  { name: 'tablet', width: 820 },
  { name: 'mobile', width: 375 },
];

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

const reference = JSON.parse(readFileSync(join(here, '../fixtures/documents/valid/basic.json'), 'utf8'));
reference.fontRefs = [];
for (const slide of reference.slides) {
  slide.layers = slide.layers.filter((layer) => layer.type !== 'image');
  slide.background.attachmentId = null;
  for (const layer of slide.layers) layer.style.fontRef = null;
}
reference.settings.autoplay = false;

const auth = helper('auth');
const browser = await chromium.launch({ executablePath: chrome(), args: ['--no-sandbox'] });
const admin = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'de-DE' });
await admin.addCookies(auth.cookies.map((c) => ({ ...c, domain: 'localhost', path: '/' })));
const page = await admin.newPage();
let sliderId;

try {
  await page.goto(auth.admin);
  await page.locator('.sws-page-header__title').waitFor();
  sliderId = await page.evaluate(async (doc) => {
    const config = window.swsEditorConfig;
    const call = async (method, path, body) => {
      const response = await fetch(config.restRoot + path, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': config.nonce },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(`${method} ${path}: ${JSON.stringify(data)}`);
      return data;
    };
    const created = await call('POST', 'sliders', { title: `E2E Parity ${Date.now()}` });
    const document = { ...doc, id: created.document.id };
    const saved = await call('PUT', `sliders/${created.id}`, { title: created.title, document, expectedVersion: created.version });
    await call('POST', `sliders/${created.id}/publish`, { version: saved.version });
    return created.id;
  }, reference);
  check('reference slider created and published', sliderId > 0);

  const { url } = helper('page', String(sliderId));
  const first = reference.slides[0].layers.map((l) => l.id);

  for (const { name, width } of WIDTHS) {
    // ---------- frontend ----------
    const visitor = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const front = await visitor.newPage();
    await front.goto(url);
    await front.locator('.sws-slider.sws-js').first().waitFor();
    await front.waitForTimeout(500);
    const published = await front.evaluate((ids) => {
      const slider = document.querySelector('.sws-slider');
      const frame = slider.getBoundingClientRect();
      const out = { width: frame.width, layers: {} };
      for (const id of ids) {
        const el = slider.querySelector(`[data-sws-layer="${id}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        out.layers[id] = {
          left: r.left - frame.left, top: r.top - frame.top, width: r.width, height: r.height,
          font: parseFloat(getComputedStyle(el.querySelector('.sws-layer__body') ?? el).fontSize),
        };
      }
      return out;
    }, first);
    await front.screenshot({ path: join(shots, `frontend-${name}.png`) });
    await visitor.close();

    // ---------- editor preview at the measured container width ----------
    await page.goto(`${auth.admin}#/sliders/${sliderId}`);
    await page.locator('.sws-canvas__layer').first().waitFor();
    const field = page.getByLabel('Vorschaubreite (px)');
    await field.fill(String(Math.round(published.width)));
    await field.blur();
    await page.waitForTimeout(900);
    const preview = await page.evaluate((ids) => {
      const frame = document.querySelector('.sws-canvas__frame .sws-slider, .sws-canvas__frame').getBoundingClientRect();
      const out = { width: frame.width, layers: {} };
      for (const id of ids) {
        const el = document.querySelector(`.sws-canvas__layer[data-sws-layer="${id}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        out.layers[id] = {
          left: r.left - frame.left, top: r.top - frame.top, width: r.width, height: r.height,
          font: parseFloat(getComputedStyle(el.querySelector('.sws-layer__body') ?? el).fontSize),
        };
      }
      return out;
    }, first);
    await page.screenshot({ path: join(shots, `editor-${name}.png`) });

    const tolerance = TOLERANCE_PX + published.width * TOLERANCE_RATIO;
    check(`${name}: container widths match`, Math.abs(preview.width - published.width) <= tolerance, `${preview.width} vs ${published.width}`);
    const ids = Object.keys(published.layers);
    check(`${name}: ${ids.length} layers compared`, ids.length >= 2);
    for (const id of ids) {
      const a = published.layers[id];
      const b = preview.layers[id];
      if (!b) { check(`${name}/${id}: present in preview`, false); continue; }
      const worst = Math.max(...['left', 'top', 'width', 'height'].map((k) => Math.abs(a[k] - b[k])));
      check(`${name}/${id}: box within ${tolerance.toFixed(1)} px (actual ${worst.toFixed(2)})`, worst <= tolerance, `max diff ${worst.toFixed(2)} px (${JSON.stringify(a)} vs ${JSON.stringify(b)})`);
      check(`${name}/${id}: font size within ${TOLERANCE_FONT_PX} px (${a.font} vs ${b.font})`, Math.abs(a.font - b.font) <= TOLERANCE_FONT_PX, `${a.font} vs ${b.font}`);
    }
  }
} catch (error) {
  failures++;
  console.error(error);
} finally {
  helper('cleanup', 'E2E Parity');
  await browser.close();
}
console.log(failures === 0 ? '\nParity OK' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
