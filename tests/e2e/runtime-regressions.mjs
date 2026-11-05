/** Native browser regressions without WordPress writes. Run after npm run build. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
  executablePath: [join(cache, chrome, 'chrome-linux/chrome'), join(cache, chrome, 'chrome-linux64/chrome')].find(existsSync),
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const css = readFileSync(join(root, 'build/runtime/runtime.css'), 'utf8');
const runtime = readFileSync(join(root, 'build/runtime/runtime.js'), 'utf8');
const phase = { preset: 'fade', startMs: 200, durationMs: 300, easing: 'linear', distance: 0 };
const config = {
  autoplay: true,
  loop: true,
  breakpoints: Object.fromEntries(
    ['desktop', 'tablet', 'mobile'].map((name) => [
      name,
      { minWidth: 0, stageWidth: 800, stageHeight: 300 },
    ]),
  ),
  slides: ['a', 'b', 'c'].map((id) => ({
    id,
    durationMs: 1000,
    transition: { type: 'fade', durationMs: 200 },
    layers: [{ id, animation: { enter: phase, exit: { mode: 'slide-end' } } }],
  })),
};
let releaseImage;
const slowImage = new Promise((resolve) => {
  releaseImage = resolve;
});
await page.route('http://sws.test/**', async (route) => {
  if (route.request().url().endsWith('/slow.svg')) {
    await slowImage;
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300"><rect width="800" height="300" fill="green"/></svg>',
    });
  } else {
    await route.fulfill({
      contentType: 'text/html',
      body: `<style>${css}.sws-slider{width:800px;margin-top:80px}.sws-stage{height:300px}.sws-layer{inset:0}.sws-slide{background:#ccc}</style>
      <section class="sws-slider" data-sws-slider><div class="sws-viewport">${config.slides.map((slide, index) => `<div class="sws-slide ${index === 0 ? 'sws-is-active' : ''}" ${index === 0 ? '' : 'hidden inert'}><div class="sws-stage"><div class="sws-layer" data-sws-layer="${slide.id}"><div class="sws-layer__anim">${index === 1 ? '<img src="/slow.svg" loading="lazy" class="sws-image">' : slide.id}</div></div></div></div>`).join('')}</div>
      <div class="sws-controls"><button class="sws-prev">Back</button><button class="sws-next">Next</button></div><script type="application/json" class="sws-config">${JSON.stringify(config)}</script></section>`,
    });
  }
});
try {
  await page.goto('http://sws.test/', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: runtime });
  await page.waitForFunction(() =>
    document.querySelector('.sws-slider').classList.contains('sws-js'),
  );
  // Let autoplay request the next slide. The old image/content must remain while it loads.
  await page.waitForFunction(() => document.querySelector('img').loading === 'eager');
  assert.equal(await page.locator('.sws-slide:not([hidden])').count(), 1);
  assert.equal(
    await page.locator('.sws-is-active [data-sws-layer]').getAttribute('data-sws-layer'),
    'a',
  );
  releaseImage();
  await page.waitForFunction(() => document.querySelector('.sws-is-active [data-sws-layer="b"]'));
  assert.equal(
    await page.locator('img').evaluate((image) => image.complete && image.naturalWidth > 0),
    true,
  );
  const entrance = await page.locator('[data-sws-layer="b"] .sws-layer__anim').evaluate((el) => ({
    opacity: Number(getComputedStyle(el).opacity),
    states: el.getAnimations().map((animation) => animation.playState),
  }));
  assert.equal(entrance.opacity, 0, 'no static-content flash before entrance');
  assert.ok(entrance.states.includes('paused'), 'entrance waits for slide transition');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-sws-layer="b"] .sws-layer__anim')
      .getAnimations()
      .some((animation) => animation.playState === 'running'),
  );
  await page.waitForFunction(() => document.querySelector('.sws-is-active [data-sws-layer="c"]'));
  // Pointer hover intentionally pauses autoplay; leaving resumes it.
  await page.locator('.sws-slider').hover();
  await page.waitForTimeout(1400);
  assert.equal(
    await page.locator('.sws-is-active [data-sws-layer]').getAttribute('data-sws-layer'),
    'c',
  );
  await page.mouse.move(1000, 750);
  await page.waitForFunction(() => document.querySelector('.sws-is-active [data-sws-layer="a"]'));
  assert.deepEqual(errors, []);
  console.log('✓ native image readiness, no entrance flash, autoplay, hover pause and looping');
} finally {
  releaseImage();
  await browser.close();
}
