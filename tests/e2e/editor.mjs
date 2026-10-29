/**
 * End-to-end flow against the local development WordPress (not part of CI):
 * create slider -> edit layers -> mobile override -> install a local Google Font -> use it ->
 * publish -> embed twice -> check frontend (desktop, mobile, no JS, reduced motion).
 *
 * Every browser request is recorded: neither editor nor frontend may contact a foreign font
 * origin (PLAN.md 16). Usage: node tests/e2e/editor.mjs [screenshot-dir]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2] ?? join(here, '../../coverage/e2e');
mkdirSync(shots, { recursive: true });
const helper = (...args) => JSON.parse(execFileSync('php', [join(here, 'wp-helper.php'), ...args], { encoding: 'utf8' }));
const chrome = () => {
  const base = join(homedir(), '.cache/ms-playwright');
  const dir = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return join(base, dir, 'chrome-linux/chrome');
};

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

const TITLE = `E2E Hero ${Date.now()}`;
const auth = helper('auth');
const browser = await chromium.launch({ executablePath: chrome(), args: ['--no-sandbox'] });
const requests = [];
const errors = [];
function watch(page, label) {
  page.on('request', (r) => requests.push({ label, url: r.url() }));
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => {
    const source = m.location().url;
    // Only errors of this site count (blocked theme fonts, gravatar etc. are third-party).
    if (m.type() === 'error' && !source.endsWith('favicon.ico') && (source === '' || source.startsWith('http://localhost/'))) {
      errors.push(`${label}: ${m.text()} @ ${source}`);
    }
  });
}

const admin = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'de-DE' });
await admin.addCookies(auth.cookies.map((c) => ({ ...c, domain: 'localhost', path: '/' })));
const page = await admin.newPage();
watch(page, 'admin');

try {
  // ---------- list + create ----------
  await page.goto(auth.admin);
  await page.locator('.sws-page-header__title').waitFor();
  check('slider list renders in German', (await page.locator('.sws-page-header__title').textContent()) === 'Slider');
  await page.screenshot({ path: join(shots, '01-list.png') });
  await page.getByRole('button', { name: 'Neuer Slider' }).first().click();
  await page.getByLabel('Name').fill(TITLE);
  await page.getByRole('button', { name: 'Anlegen und bearbeiten' }).click();
  await page.locator('.sws-canvas__frame').waitFor();
  check('editor opens after creating', page.url().includes('#/sliders/'));
  const sliderId = Number(page.url().match(/sliders\/(\d+)/)[1]);

  // ---------- text layer ----------
  await page.getByRole('button', { name: 'Ebene hinzufügen' }).click();
  await page.getByRole('menuitem', { name: 'Text' }).or(page.locator('.q-menu .q-item', { hasText: 'Text' })).first().click();
  const textArea = page.getByLabel('Text', { exact: true });
  await textArea.fill('Willkommen ÄÖÜäöüß €\nzweite Zeile');
  await textArea.blur();
  await page.waitForTimeout(150);
  const canvasText = await page.locator('.sws-canvas__layer .sws-text').first().textContent();
  check('text appears on the canvas', canvasText?.includes('ÄÖÜäöüß €') === true, canvasText ?? '');

  // drag = one undo step
  const layer = page.locator('.sws-canvas__layer').first();
  const before = await layer.boundingBox();
  await page.mouse.move(before.x + 40, before.y + 30);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(before.x + 40 + i * 8, before.y + 30 + i * 4);
  await page.mouse.up();
  const after = await layer.boundingBox();
  check('drag moves the layer', Math.abs(after.x - before.x - 80) < 4, `${before.x} -> ${after.x}`);
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  const undone = await layer.boundingBox();
  check('one undo reverts the whole drag', Math.abs(undone.x - before.x) < 1.5, `${before.x} vs ${undone.x}`);
  await page.getByRole('button', { name: 'Wiederholen' }).click();
  check('redo restores the drag', Math.abs((await layer.boundingBox()).x - after.x) < 1.5);

  // escape cancels a drag
  await page.mouse.move(after.x + 30, after.y + 30);
  await page.mouse.down();
  await page.mouse.move(after.x + 130, after.y + 30, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  check('Escape cancels a drag', Math.abs((await layer.boundingBox()).x - after.x) < 1.5);

  // ---------- mobile override ----------
  const desktopSize = await page.locator('.sws-canvas__layer .sws-layer__body').first().evaluate((el) => el.style.fontSize);
  await page.getByRole('radio', { name: /Mobil/ }).click();
  await page.locator('.sws-canvas__frame').waitFor();
  const fontField = page.getByLabel('Schriftgröße');
  await fontField.fill('30');
  await fontField.press('Enter');
  await page.waitForTimeout(150);
  check('override is marked on mobile', (await page.locator('.sws-ov--set').count()) > 0);
  const mobileSize = await page.locator('.sws-canvas__layer .sws-layer__body').first().evaluate((el) => el.style.fontSize);
  check('mobile font size uses the mobile stage', mobileSize === `${Math.round((30 * 100 * 10000) / 390) / 10000}cqw`, mobileSize);
  await page.screenshot({ path: join(shots, '02-editor-mobile.png') });
  await page.getByRole('radio', { name: /Desktop/ }).click();
  const desktopAgain = await page.locator('.sws-canvas__layer .sws-layer__body').first().evaluate((el) => el.style.fontSize);
  check('desktop unchanged by mobile override', desktopAgain === desktopSize, `${desktopSize} vs ${desktopAgain}`);

  // ---------- button ----------
  await page.getByRole('button', { name: 'Ebene hinzufügen' }).click();
  await page.locator('.q-menu .q-item', { hasText: 'Button' }).click();
  const link = page.getByLabel('Link', { exact: true });
  await link.fill('javascript:alert(1)');
  await link.blur();
  await page.waitForTimeout(200);
  check('javascript: link is flagged', (await page.locator('.sws-notice--warn').count()) > 0);
  await link.fill('https://example.com/angebot');
  await link.blur();

  // ---------- save ----------
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await page.locator('.sws-topbar__status--ok').waitFor({ timeout: 8000 });
  check('saved state is shown', (await page.locator('.sws-topbar__status').textContent())?.includes('gespeichert') === true);

  // ---------- local font installation ----------
  await page.goto(auth.admin + '#/fonts');
  await page.locator('.sws-fonts table').waitFor();
  check('variable families are marked unsupported', (await page.locator('tr', { hasText: 'Roboto' }).locator('.sws-fonts__badge').count()) === 1);
  const lato = page.locator('tr', { hasText: 'Lato' });
  await lato.getByRole('button').first().click();
  await page.getByRole('button', { name: 'Lokal installieren' }).click();
  await page.locator('.sws-fonts__item', { hasText: 'Lato' }).waitFor({ timeout: 60000 });
  const sampleFont = await page.locator('.sws-fonts__item', { hasText: 'Lato' }).locator('.sws-fonts__sample').first().evaluate((el) => getComputedStyle(el).fontFamily);
  await page.waitForTimeout(500);
  const latoLoaded = await page.evaluate(async (family) => {
    await document.fonts.ready;
    return document.fonts.check(`16px ${family.split(',')[0]}`, 'ÄÖÜäöüß€');
  }, sampleFont);
  check('installed font renders from local files', latoLoaded, sampleFont);
  await page.screenshot({ path: join(shots, '03-fonts.png'), fullPage: true });

  // ---------- use the font, publish ----------
  await page.goto(`${auth.admin}#/sliders/${sliderId}`);
  await page.locator('.sws-canvas__layer').first().waitFor();
  await page.locator('.sws-canvas__layer').first().click({ position: { x: 20, y: 20 } });
  await page.getByLabel('Schrift (lokal installiert)').click();
  await page.locator('.q-menu .q-item', { hasText: 'Lato 700' }).click();
  await page.getByRole('button', { name: 'Veröffentlichen' }).click();
  await page.locator('.q-notification', { hasText: 'veröffentlicht' }).waitFor({ timeout: 10000 });
  check('publish succeeds', true);
  await page.screenshot({ path: join(shots, '04-editor-published.png') });

  // ---------- frontend ----------
  const { url } = helper('page', String(sliderId));
  const visitor = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // Foreign font hosts are unreachable for visitors: the slider must still render its local font.
  // (The active theme may request Google Fonts itself; PLAN.md 8.1 does not cover other code.)
  await visitor.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  const front = await visitor.newPage();
  watch(front, 'frontend');
  await front.goto(url);
  await front.locator('.sws-slider.sws-js').first().waitFor();
  check('two independent instances', (await front.locator('[data-sws-slider]').count()) === 2);
  const ids = await front.locator('[data-sws-slider]').evaluateAll((els) => els.map((e) => e.id));
  check('instance ids are unique', new Set(ids).size === 2, ids.join(','));
  const headline = front.locator('.sws-slider').first().locator('.sws-text').first();
  check('text is published', (await headline.textContent())?.includes('ÄÖÜäöüß €') === true);
  const fontOk = await front.evaluate(async () => {
    await document.fonts.ready;
    const el = document.querySelector('.sws-slider .sws-layer__body');
    const family = getComputedStyle(el).fontFamily.split(',')[0];
    return { family, loaded: document.fonts.check(`700 16px ${family}`, 'ÄÖÜ€') };
  });
  check('frontend uses the local font with Google blocked', fontOk.loaded && fontOk.family.includes('sws-lato'), JSON.stringify(fontOk));
  const foreignLinks = await front.evaluate(() =>
    [...document.querySelectorAll('link[href*="fonts.googleapis"], link[href*="fonts.gstatic"], link[rel="preconnect"], link[rel="dns-prefetch"]')]
      .filter((l) => /google/.test(l.href))
      .map((l) => l.id || '(no id)'),
  );
  check('no Google Fonts link, preconnect or prefetch from this plugin', foreignLinks.every((id) => !id.startsWith('sws-')), foreignLinks.join(','));
  await front.waitForTimeout(800);
  await front.screenshot({ path: join(shots, '05-frontend-desktop.png'), fullPage: true });

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  const phone = await mobile.newPage();
  watch(phone, 'mobile');
  await phone.goto(url);
  await phone.locator('.sws-slider.sws-js').first().waitFor();
  const phoneFont = await phone.locator('.sws-slider .sws-layer__body').first().evaluate((el) => {
    const slider = el.closest('.sws-slider');
    return { px: parseFloat(getComputedStyle(el).fontSize), width: slider.getBoundingClientRect().width };
  });
  check('mobile override applies by container width', Math.abs(phoneFont.px - (30 * phoneFont.width) / 390) < 0.6, JSON.stringify(phoneFont));
  await phone.waitForTimeout(800);
  await phone.screenshot({ path: join(shots, '06-frontend-mobile.png'), fullPage: true });

  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  const staticPage = await noJs.newPage();
  await staticPage.goto(url);
  const visibleText = await staticPage.locator('.sws-slider').first().locator('.sws-slide:not([hidden]) .sws-text').first().isVisible();
  check('first slide readable without JavaScript', visibleText);
  check('controls hidden without JavaScript', !(await staticPage.locator('.sws-controls').first().isVisible().catch(() => false)));

  const reduced = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
  const calm = await reduced.newPage();
  await calm.goto(url);
  await calm.locator('.sws-slider.sws-js').first().waitFor();
  const animations = await calm.evaluate(
    () => document.getAnimations().filter((a) => a.effect?.target instanceof Element && a.effect.target.closest('.sws-slider')).length,
  );
  check('reduced motion: no animations', animations === 0, String(animations));

  // ---------- network: only local font files ----------
  const foreign = requests.filter((r) => r.label === 'admin' && /fonts\.(googleapis|gstatic)\.com/.test(r.url));
  check('editor makes no request to Google Fonts', foreign.length === 0, foreign.map((r) => r.url).join(', '));
  const fontRequests = requests.filter((r) => /\.woff2(\?|$)/.test(r.url) && r.url.includes('/sw-sliderman/fonts/'));
  check('font files come from this site', fontRequests.length > 0 && fontRequests.every((r) => r.url.startsWith('http://localhost/')));
} catch (error) {
  failures++;
  console.error(error);
  await page.screenshot({ path: join(shots, 'error.png') }).catch(() => {});
} finally {
  check('no JavaScript errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  helper('cleanup', 'E2E Hero');
}
console.log(failures === 0 ? 'E2E passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
