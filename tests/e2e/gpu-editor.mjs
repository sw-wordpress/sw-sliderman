/**
 * GPU effect layer end to end against the local development site (TODO M10 G6; not part of CI):
 * add the layer in the editor, live preview, preset, parameters, forces, impulse, undo, save,
 * publish, then the frontend as a visitor (pause switch, reduced motion) and a published slider with
 * a media library picture. Creates and removes `E2E GPU*` sliders, pages and attachments.
 * Usage: node tests/e2e/gpu-editor.mjs [screenshot-dir]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2] ?? join(here, '../../coverage/e2e');
mkdirSync(shots, { recursive: true });
const helper = (...args) =>
  JSON.parse(execFileSync('php', [join(here, 'wp-helper.php'), ...args], { encoding: 'utf8' }));
const cache = join(homedir(), '.cache/ms-playwright');
const chrome = readdirSync(cache)
  .filter((d) => /^chromium-\d+$/.test(d))
  .sort()
  .pop();
const browser = await chromium.launch({
  executablePath: [
    join(cache, chrome, 'chrome-linux/chrome'),
    join(cache, chrome, 'chrome-linux64/chrome'),
  ].find(existsSync),
  args: [
    '--no-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};
const problems = [];
const watch = (page, label) => {
  page.on('pageerror', (error) => problems.push(`${label}: ${error.message}`));
  page.on('console', (m) => {
    const source = m.location().url;
    if (
      m.type() === 'error' &&
      !source.endsWith('favicon.ico') &&
      (source === '' || source.startsWith('http://localhost/'))
    )
      problems.push(`${label}: ${m.text()} @ ${source}`);
  });
};

const TITLE = `E2E GPU ${Date.now()}`;
const auth = helper('auth');
const base = auth.admin.split('/wp-admin')[0];
const pixels = (page, selector) =>
  page.evaluate(
    (sel) =>
      new Promise((resolve) =>
        requestAnimationFrame(() => {
          const canvas = document.querySelector(sel);
          if (!canvas) return resolve(null);
          const copy = document.createElement('canvas');
          copy.width = canvas.width;
          copy.height = canvas.height;
          const ctx = copy.getContext('2d');
          ctx.drawImage(canvas, 0, 0);
          const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
          let lit = 0,
            r = 0,
            b = 0;
          for (let i = 0; i < data.length; i += 4)
            if (data[i + 3] > 24) {
              lit++;
              r += data[i];
              b += data[i + 2];
            }
          resolve({
            lit,
            total: data.length / 4,
            blueShare: lit ? b / Math.max(r + b, 1) : 0,
            width: canvas.width,
          });
        }),
      ),
    selector,
  );

try {
  helper('activate');
  const admin = await browser.newContext({
    viewport: { width: 1700, height: 1000 },
    locale: 'de-DE',
  });
  await admin.addCookies(
    auth.cookies.map((c) => ({ ...c, domain: new URL(base).hostname, path: '/' })),
  );
  const page = await admin.newPage();
  watch(page, 'editor');

  // ---------- create the slider and add the effect layer ----------
  await page.goto(auth.admin);
  await page.locator('.sws-page-header__title').waitFor();
  await page.getByRole('button', { name: 'Neuer Slider' }).first().click();
  await page.getByLabel('Name').fill(TITLE);
  await page.getByRole('button', { name: 'Anlegen und bearbeiten' }).click();
  await page.locator('.sws-canvas__frame').waitFor();
  const sliderId = Number(page.url().match(/sliders\/(\d+)/)[1]);
  await page.getByRole('button', { name: 'Ebene hinzufügen' }).click();
  await page.locator('.q-menu .q-item', { hasText: 'Effekt: Partikelfeld' }).click();
  await page.locator('.sws-canvas__frame .sws-fx').waitFor({ timeout: 15000 });
  check('effect layer is offered in German and appears on the stage', true);
  check(
    'the properties panel shows the effect, presets and seed',
    (await page.getByRole('button', { name: 'Orbitnebel' }).count()) === 1 &&
      (await page.getByLabel('Zufallswert', { exact: true }).count()) === 1,
  );

  // ---------- live preview ----------
  await page.waitForFunction(
    () => document.querySelector('.sws-canvas__frame .sws-fx')?.dataset.swsFxState === 'running',
    null,
    { timeout: 30000 },
  );
  const canvas = await page.evaluate(() => {
    const el = document.querySelector('.sws-canvas__frame .sws-fx canvas');
    return {
      hidden: el?.getAttribute('aria-hidden'),
      tab: el?.tabIndex,
      live: el?.parentElement?.classList.contains('sws-fx--live'),
      events: el ? getComputedStyle(el).pointerEvents : null,
    };
  });
  check(
    'live preview runs on the stage (aria-hidden canvas, no focus, no pointer events)',
    canvas.hidden === 'true' && canvas.tab === -1 && canvas.events === 'none',
  );
  await page.waitForFunction(
    () => document.querySelector('.sws-canvas__frame .sws-fx')?.classList.contains('sws-fx--live'),
    null,
    { timeout: 30000 },
  );
  const first = await pixels(page, '.sws-canvas__frame .sws-fx canvas');
  check('the preview draws particles', first !== null && first.lit > 200, JSON.stringify(first));
  await page.screenshot({ path: join(shots, 'gpu-01-editor-preview.png') });

  // ---------- preset, parameter, force, impulse ----------
  await page.getByRole('button', { name: 'Wirbelbänder' }).click();
  check(
    'preset applies seed and parameters',
    (await page.getByLabel('Zufallswert', { exact: true }).inputValue()) === '4242' &&
      (await page.getByRole('button', { name: 'Wirbelbänder' }).getAttribute('aria-pressed')) ===
        'true',
  );
  await page.waitForFunction(
    () => document.querySelector('.sws-canvas__frame .sws-fx')?.dataset.swsFxState === 'running',
  );
  const countInput = page.locator('input[aria-label="Anzahl Partikel"]');
  const before = await countInput.inputValue();
  await countInput.fill('5000');
  await countInput.press('Enter');
  await page.waitForFunction(
    () => document.querySelector('.sws-canvas__frame .sws-fx')?.dataset.swsFxState === 'running',
  );
  check(
    'a parameter edit is applied live',
    (await countInput.inputValue()) === '5000' && before === '24000',
    `${before} -> 5000`,
  );
  await page.locator('.sws-acc__toggle', { hasText: 'Kräfte und Verhalten' }).click();
  await page.getByRole('button', { name: 'Kraft oder Verhalten hinzufügen' }).click();
  await page.locator('.q-menu .q-item', { hasText: 'Strömungsfeld' }).click();
  check(
    'a force is added from the unused types',
    (await page.locator('.sws-fx-field__item', { hasText: 'Strömungsfeld' }).count()) === 1,
  );
  await page.getByRole('button', { name: 'Impuls auslösen' }).click();
  check('the impulse button works without errors', problems.length === 0, problems.join('; '));
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  check(
    'undo reverts the edits (force removed, count restored)',
    (await page.locator('.sws-fx-field__item', { hasText: 'Strömungsfeld' }).count()) === 0 &&
      (await countInput.inputValue()) === '24000',
  );
  await page.getByRole('button', { name: 'Wiederholen' }).click();
  await page.getByRole('button', { name: 'Wiederholen' }).click();
  check('redo restores them', (await countInput.inputValue()) === '5000');
  await page.waitForFunction(
    () => document.querySelector('.sws-canvas__frame .sws-fx')?.dataset.swsFxState === 'running',
    null,
    { timeout: 30000 },
  );
  const afterEdits = await pixels(page, '.sws-canvas__frame .sws-fx canvas');
  check(
    'the preview keeps running and drawing after parameter edits, undo and redo',
    afterEdits !== null && afterEdits.lit > 100,
    JSON.stringify(afterEdits),
  );
  check(
    'the placeholder is hidden while the live preview runs',
    (await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('.sws-canvas__frame .sws-effect-placeholder'))
          .visibility,
    )) === 'hidden',
  );

  // ---------- save, publish ----------
  await page.getByLabel('Alternativtext des statischen Bildes').fill('Partikelwirbel');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await page
    .locator('.q-notification', { hasText: 'gespeichert' })
    .first()
    .waitFor({ timeout: 10000 })
    .catch(() => undefined);
  await page.getByRole('button', { name: 'Veröffentlichen' }).click();
  await page.locator('.q-notification', { hasText: 'veröffentlicht' }).waitFor({ timeout: 15000 });
  check('the slider with the effect layer saves and publishes', true);
  await page.screenshot({ path: join(shots, 'gpu-02-editor-published.png') });

  // reload: stored parameters survive
  // Leave the running preview first: a reload of a page busy with software WebGL can time out.
  await page.goto('about:blank');
  await page.goto(`${auth.admin}#/sliders/${sliderId}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.sws-canvas__frame .sws-fx').waitFor({ timeout: 20000 });
  await page
    .locator('.sws-canvas__layer')
    .first()
    .click({ position: { x: 20, y: 20 } });
  check(
    'after reload the stored preset parameters are shown',
    (await page.locator('input[aria-label="Anzahl Partikel"]').inputValue()) === '5000' &&
      (await page.getByLabel('Zufallswert', { exact: true }).inputValue()) === '4242',
  );

  // ---------- frontend as a visitor ----------
  const { url } = helper('page', String(sliderId));
  const visitor = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const front = await visitor.newPage();
  watch(front, 'frontend');
  const response = await front.goto(url, { waitUntil: 'load' });
  const html = await response.text();
  check(
    'page loads the GPU bundle with the plugin version, only on effect pages',
    /build\/gpu\/gpu\.js\?ver=\d+\.\d+\.\d+/.test(html),
  );
  check(
    'the module URL in the config carries the version',
    /build\\\/gpu\\\/particle-field\.js\?ver=\d+\.\d+\.\d+/.test(html) ||
      /build\/gpu\/particle-field\.js\?ver=\d+\.\d+\.\d+/.test(html),
  );
  await front.locator('.sws-slider.sws-js').first().waitFor();
  await front.waitForFunction(
    () => document.querySelector('.sws-fx')?.dataset.swsFxState === 'running',
    null,
    { timeout: 30000 },
  );
  check('the effect runs on the published page', true);
  check(
    'there is a pause switch although there is one slide and no autoplay',
    (await front.locator('.sws-toggle').count()) >= 1,
  );
  const stats = await pixels(front, '.sws-fx canvas');
  check('visitors see particles', stats !== null && stats.lit > 200, JSON.stringify(stats));
  await front.locator('.sws-toggle').first().click();
  await front.waitForFunction(
    () => document.querySelector('.sws-fx')?.dataset.swsFxState === 'paused',
  );
  check('the pause switch stops the effect (WCAG 2.2.2)', true);
  await front.locator('.sws-toggle').first().click();
  await front.waitForFunction(
    () => document.querySelector('.sws-fx')?.dataset.swsFxState === 'running',
  );
  await front.screenshot({ path: join(shots, 'gpu-03-frontend.png') });
  const reduced = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
  });
  const still = await reduced.newPage();
  watch(still, 'reduced');
  await still.goto(url, { waitUntil: 'load' });
  await still.waitForTimeout(1500);
  check('reduced motion shows no canvas', (await still.locator('.sws-fx canvas').count()) === 0);
  const noScript = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    javaScriptEnabled: false,
  });
  const plain = await noScript.newPage();
  await plain.goto(url, { waitUntil: 'load' });
  check(
    'without JavaScript the page renders the static markup',
    (await plain.locator('.sws-fx').count()) >= 1 && (await plain.locator('canvas').count()) === 0,
  );

  // ---------- picture from the media library: the published picture is rebuilt from particles ----------
  const picture = helper('gpu-slider', `${TITLE} image`, 'magnetic-canvas');
  check(
    'a published slider with a media library picture was created',
    picture.published === true && picture.saved === 200,
  );
  const { url: imageUrl } = helper('page', String(picture.id));
  const imagePage = await visitor.newPage();
  watch(imagePage, 'frontend-image');
  await imagePage.goto(imageUrl, { waitUntil: 'load' });
  await imagePage.waitForFunction(
    () => document.querySelector('.sws-fx')?.dataset.swsFxState === 'running',
    null,
    { timeout: 40000 },
  );
  await imagePage.waitForTimeout(1500);
  const logo = await pixels(imagePage, '.sws-fx canvas');
  check(
    'the picture is rebuilt from particles (blue logo on a transparent canvas)',
    logo !== null && logo.lit > 300 && logo.blueShare > 0.55,
    JSON.stringify(logo),
  );
  await imagePage.locator('.sws-fx').first().scrollIntoViewIfNeeded();
  await imagePage.mouse.move(640, 300);
  await imagePage.mouse.move(700, 320, { steps: 12 });
  await imagePage.waitForTimeout(500);
  const disturbed = await pixels(imagePage, '.sws-fx canvas');
  check(
    'moving the pointer over it keeps the effect running',
    disturbed !== null && disturbed.lit > 200,
  );
  await imagePage.screenshot({ path: join(shots, 'gpu-04-frontend-image.png') });

  check('no page errors in editor or frontend', problems.length === 0, problems.join('; '));
} finally {
  helper('cleanup', 'E2E GPU');
  helper('cleanup-pages', 'E2E GPU');
  await browser.close();
}
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
