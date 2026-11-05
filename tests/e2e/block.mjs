/**
 * Gutenberg block in the real block editor of the local dev site (TODO M4.12; not part of CI).
 * Creates and removes `E2E Block*` sliders and pages. Usage: node tests/e2e/block.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
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
  args: ['--no-sandbox'],
});

const TITLE = `E2E Block ${Date.now()}`;
const auth = helper('auth');
const base = auth.admin.split('/wp-admin')[0];
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

try {
  helper('activate');
  const slider = helper('slider', TITLE);
  check('test slider created and published', slider.published === true);

  const admin = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await admin.addCookies(
    auth.cookies.map((c) => ({ ...c, domain: new URL(base).hostname, path: '/' })),
  );
  const page = await admin.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));

  await page.goto(`${base}/wp-admin/post-new.php?post_type=page`);
  await page.waitForFunction(
    () =>
      window.wp?.data?.select('core/block-editor') &&
      window.wp.blocks.getBlockType('sw-sliderman/slider'),
    null,
    { timeout: 30000 },
  );
  await page.evaluate(() => {
    const prefs = window.wp.data.dispatch('core/preferences');
    prefs.set('core/edit-post', 'welcomeGuide', false);
    prefs.set('core/edit-post', 'fullscreenMode', false);
  });

  const type = await page.evaluate(() => {
    const t = window.wp.blocks.getBlockType('sw-sliderman/slider');
    return {
      title: t.title,
      category: t.category,
      strings: window.swsBlockStrings,
      attributes: Object.keys(t.attributes),
    };
  });
  check(
    'block registered with translated title and strings from PHP',
    type.title.length > 0 && type.strings?.published?.includes('%s'),
    JSON.stringify(type),
  );
  check('block declares the sliderId attribute', type.attributes.includes('sliderId'));
  // Recent WordPress renders the canvas in an iframe; older versions render in the page.
  const canvas =
    (await page.locator('iframe[name="editor-canvas"]').count()) > 0
      ? page.frameLocator('iframe[name="editor-canvas"]')
      : page;

  // Insert through the inserter search, like an editor would.
  await page.evaluate(() => window.wp.data.dispatch('core/edit-post')?.closeGeneralSidebar?.());
  await page
    .getByRole('button', { name: /Inserter|Block-Inserter|Inserter umschalten/i })
    .first()
    .click();
  await page.getByRole('searchbox').first().fill('SliderMan');
  await page
    .getByRole('option', { name: new RegExp(type.title, 'i') })
    .first()
    .click();
  await canvas.locator('[data-type="sw-sliderman/slider"]').first().waitFor({ timeout: 15000 });
  check(
    'block inserted via the inserter',
    (
      await page.evaluate(() =>
        window.wp.data
          .select('core/block-editor')
          .getBlocks()
          .map((b) => b.name),
      )
    ).includes('sw-sliderman/slider'),
  );

  // The slider list loads from the REST API and the own slider is selectable.
  const select = canvas.locator('[data-type="sw-sliderman/slider"] select').first();
  await select.waitFor({ timeout: 15000 });
  const options = await select.locator('option').allTextContents();
  check(
    'picker lists the published slider',
    options.some((text) => text === TITLE),
    options.join(' | '),
  );
  await select.selectOption({ label: TITLE });
  const placeholder = await canvas
    .locator('[data-type="sw-sliderman/slider"] .components-placeholder__instructions')
    .textContent();
  check('placeholder confirms the published slider', placeholder.includes(TITLE), placeholder);
  check(
    'editor shows no slider markup or runtime',
    (await canvas.locator('[data-type="sw-sliderman/slider"] [data-sws-slider]').count()) === 0,
  );
  const attrs = await page.evaluate(
    () => window.wp.data.select('core/block-editor').getBlocks()[0].attributes,
  );
  check(
    'sliderId stored as integer',
    Number.isInteger(attrs.sliderId) && attrs.sliderId === slider.id,
    JSON.stringify(attrs),
  );

  // Save, then inspect the saved content and the public page.
  await page.evaluate((title) => {
    window.wp.data.dispatch('core/editor').editPost({ title, status: 'publish' });
    return window.wp.data.dispatch('core/editor').savePost();
  }, `${TITLE} page`);
  await page.waitForFunction(
    () =>
      window.wp.data.select('core/editor').getCurrentPost().status === 'publish' &&
      !window.wp.data.select('core/editor').isSavingPost(),
    null,
    { timeout: 30000 },
  );
  const saved = await page.evaluate(() => ({
    link: window.wp.data.select('core/editor').getPermalink(),
    content: window.wp.data.select('core/editor').getCurrentPost().content,
  }));
  check(
    'saved as a dynamic block without stored markup',
    saved.content.includes(`<!-- wp:sw-sliderman/slider {"sliderId":${slider.id}} /-->`),
    saved.content,
  );
  check('no editor page errors', problems.length === 0, problems.join('; '));

  const visitor = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const front = await visitor.newPage();
  const frontErrors = [];
  front.on('pageerror', (error) => frontErrors.push(error.message));
  const response = await front.goto(saved.link, { waitUntil: 'load' });
  const source = await response.text();
  check(
    'front page renders the slider once',
    (await front.locator('section[data-sws-slider]').count()) === 1,
  );
  check(
    'runtime is requested with the plugin version',
    /build\/runtime\/runtime\.js\?ver=\d+\.\d+\.\d+/.test(source),
    source.match(/runtime\.js[^"']*/)?.[0],
  );
  check('runtime enhanced the slider', (await front.locator('section.sws-js').count()) === 1);
  check('no frontend page errors', frontErrors.length === 0, frontErrors.join('; '));
} finally {
  helper('cleanup', 'E2E Block');
  helper('cleanup-pages', 'E2E Block');
  await browser.close();
}
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
