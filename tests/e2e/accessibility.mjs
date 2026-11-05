/**
 * Accessibility regressions in real Chromium (TODO M4.17-M4.22). Intercepted fixture, no WordPress writes.
 * Run after `npm run build`: node tests/e2e/accessibility.mjs
 */
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
  executablePath: [
    join(cache, chrome, 'chrome-linux/chrome'),
    join(cache, chrome, 'chrome-linux64/chrome'),
  ].find(existsSync),
  args: ['--no-sandbox'],
});
const css = readFileSync(join(root, 'build/runtime/runtime.css'), 'utf8');
const runtime = readFileSync(join(root, 'build/runtime/runtime.js'), 'utf8');

const fade = { preset: 'fade', startMs: 0, durationMs: 300, easing: 'linear', distance: 0 };
const bps = Object.fromEntries(
  ['desktop', 'tablet', 'mobile'].map((n) => [
    n,
    { minWidth: 0, stageWidth: 800, stageHeight: 300 },
  ]),
);

/** Markup in the shape of SliderRenderer.php. */
function html({ slides = 3, autoplay = false, brokenImage = false } = {}) {
  const config = {
    autoplay,
    loop: true,
    breakpoints: bps,
    slides: Array.from({ length: slides }, (_, i) => ({
      id: `s${i}`,
      durationMs: 1500,
      transition: { type: 'cut', durationMs: 0 },
      layers: [{ id: `l${i}`, animation: { enter: fade, exit: { mode: 'slide-end' } } }],
    })),
  };
  const slide = (i) =>
    `<div class="sws-slide${i === 0 ? ' sws-is-active' : ''}" id="s${i}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${slides}"${i === 0 ? '' : ' hidden inert'}><div class="sws-stage"><div class="sws-layer" data-sws-layer="l${i}"><div class="sws-layer__anim"><div class="sws-layer__body"><a class="sws-button" id="link${i}" href="#t${i}">Link ${i}</a>${brokenImage && i === 1 ? '<img class="sws-image" src="/missing.png" alt="Fallback text">' : ''}</div></div></div></div></div>`;
  const controls =
    slides > 1
      ? `<div class="sws-controls">${autoplay ? '<button type="button" class="sws-toggle" data-label-pause="Pause" data-label-play="Play" aria-label="Pause"><span class="sws-icon sws-icon--pause"></span></button>' : ''}<button type="button" class="sws-prev" aria-label="Previous slide"></button><div class="sws-dots">${Array.from({ length: slides }, (_, i) => `<button type="button" class="sws-dot" aria-label="Show slide ${i + 1}"${i === 0 ? ' aria-current="true"' : ''}></button>`).join('')}</div><button type="button" class="sws-next" aria-label="Next slide"></button><p class="sws-live" aria-live="polite" aria-atomic="true"></p></div>`
      : '';
  return `<!doctype html><style>${css}.sws-slider{width:800px;margin:40px}.sws-stage{height:300px}.sws-layer{inset:0}.sws-slide{background:#ccc}</style>
<section class="sws-slider" role="region" aria-roledescription="carousel" aria-label="Test" data-sws-slider><div class="sws-viewport" id="vp">${Array.from({ length: slides }, (_, i) => slide(i)).join('')}</div>${controls}<script type="application/json" class="sws-config">${JSON.stringify(config)}</script></section><a id="after" href="#after">after</a>`;
}

async function open(options, contextOptions = {}, { script = true } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1000, height: 700 },
    ...contextOptions,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('http://sws.test/**', (route) =>
    route.request().url().endsWith('/missing.png')
      ? route.fulfill({ status: 404, body: '' })
      : route.fulfill({ contentType: 'text/html', body: html(options) }),
  );
  await page.goto('http://sws.test/', { waitUntil: 'domcontentloaded' });
  if (script) {
    await page.addScriptTag({ content: runtime });
    await page.waitForFunction(
      () => document.querySelector('.sws-slider').dataset.swsState !== 'loading',
    );
  }
  return { page, context, errors };
}
const activeId = (page) =>
  page.evaluate(
    () =>
      document.activeElement?.id ||
      document.activeElement?.className ||
      document.activeElement?.tagName,
  );
const visibleSlide = (page) =>
  page.evaluate(() => [...document.querySelectorAll('.sws-slide')].findIndex((el) => !el.hidden));
let done = 0;
const pass = (name) => console.log(`✓ ${name}`) || done++;

try {
  // M4.17/M4.18: keyboard operation, visible focus, inactive content unreachable.
  {
    const { page, context, errors } = await open();
    const order = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      order.push(await activeId(page));
    }
    assert.ok(order.includes('link0'), 'active slide content is reachable');
    assert.ok(
      !order.includes('link1') && !order.includes('link2'),
      `inactive slide links stay out of tab order: ${order}`,
    );
    assert.ok(order.includes('sws-prev') && order.includes('sws-next'), 'controls are reachable');
    await page.locator('.sws-next').focus();
    await page.keyboard.press('Tab'); // keyboard modality, so :focus-visible applies
    await page.keyboard.press('Shift+Tab');
    const ring = await page.locator('.sws-next').evaluate((el) => {
      const style = getComputedStyle(el);
      return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
    });
    assert.ok(
      ring.style !== 'none' && ring.width >= 2,
      `visible focus ring ${JSON.stringify(ring)}`,
    );
    const ax = await page.accessibility?.snapshot?.();
    if (ax)
      assert.ok(
        !JSON.stringify(ax).includes('Link 1'),
        'inactive slide content is not in the accessibility tree',
      );
    assert.equal(
      await page
        .locator('.sws-slide[hidden] a')
        .first()
        .evaluate((a) => a.checkVisibility?.() ?? false),
      false,
    );
    assert.deepEqual(errors, []);
    await context.close();
    pass('keyboard order, visible focus and inactive content (M4.17, M4.18)');
  }

  // M4.17/M4.19/M4.21: keys and clicks keep focus on the control; manual change announced once.
  {
    const { page, context } = await open();
    await page.locator('.sws-next').focus();
    await page.keyboard.press('Enter');
    assert.equal(await visibleSlide(page), 1);
    assert.equal(await activeId(page), 'sws-next', 'focus stays on the triggering control');
    assert.equal(await page.locator('.sws-live').textContent(), '2 of 3');
    await page.keyboard.press('ArrowRight');
    assert.equal(await visibleSlide(page), 2);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await visibleSlide(page), 1);
    await page.locator('.sws-dot').nth(0).focus();
    await page.keyboard.press('Space');
    assert.equal(await visibleSlide(page), 0);
    assert.equal(await activeId(page), 'sws-dot');
    assert.equal(await page.locator('.sws-dot[aria-current="true"]').count(), 1);
    await context.close();
    pass('arrow keys, Enter/Space, focus kept on controls, announcement (M4.17, M4.19, M4.21)');
  }

  // M4.19: focus inside a slide pauses autoplay; swipe keeps focus inside the slider.
  {
    const { page, context } = await open({ autoplay: true }, { hasTouch: true });
    await page.locator('#link0').focus();
    await page.waitForTimeout(2200);
    assert.equal(await visibleSlide(page), 0, 'no automatic change while focus is in the slide');
    assert.equal(await activeId(page), 'link0');
    assert.equal(await page.locator('.sws-live').textContent(), '', 'autoplay never announces');
    await page.evaluate(() => {
      const vp = document.querySelector('.sws-viewport');
      const fire = (type, x) =>
        vp.dispatchEvent(
          Object.assign(new Event(type, { bubbles: true }), {
            pointerType: 'touch',
            pointerId: 1,
            clientX: x,
            clientY: 100,
          }),
        );
      fire('pointerdown', 300);
      fire('pointerup', 100);
    });
    assert.equal(await visibleSlide(page), 1);
    assert.equal(
      await page.evaluate(
        () =>
          document.activeElement.classList.contains('sws-slide') && !document.activeElement.hidden,
      ),
      true,
      'focus moved to the new slide, not lost',
    );
    await page.locator('#after').focus();
    await page.waitForFunction(() => document.querySelector('.sws-is-active').id === 's2', null, {
      timeout: 4000,
    });
    await context.close();
    pass('focus pauses autoplay, silent autoplay, swipe keeps focus (M4.19, M4.21)');
  }

  // M4.20: reduced motion -> static readable end state, no autoplay, no animation.
  {
    const { page, context } = await open({ autoplay: true }, { reducedMotion: 'reduce' });
    await page.waitForTimeout(2500);
    assert.equal(await visibleSlide(page), 0, 'no autoplay');
    const state = await page.evaluate(() => ({
      animations: document.getAnimations().length,
      opacity: getComputedStyle(document.querySelector('.sws-is-active .sws-layer__anim')).opacity,
      toggleHidden: document.querySelector('.sws-toggle').hidden,
      state: document.querySelector('.sws-slider').dataset.swsState,
    }));
    assert.deepEqual(state, { animations: 0, opacity: '1', toggleHidden: true, state: 'ready' });
    await page.locator('.sws-next').click();
    assert.equal(await visibleSlide(page), 1, 'manual navigation still works');
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    await context.close();
    pass('reduced motion: static end state, no autoplay, manual navigation (M4.20)');
  }

  // M4.22: no JavaScript, single slide, missing image.
  {
    const { page, context } = await open({}, { javaScriptEnabled: false }, { script: false });
    const visible = await page.evaluate(() => ({
      slides: [...document.querySelectorAll('.sws-slide')].filter((el) => el.checkVisibility())
        .length,
      controls: getComputedStyle(document.querySelector('.sws-controls')).display,
      opacity: getComputedStyle(document.querySelector('.sws-layer__anim')).opacity,
    }));
    assert.deepEqual(visible, { slides: 1, controls: 'none', opacity: '1' });
    await context.close();
    pass('without JavaScript: first slide readable, no dead controls (M4.22)');
  }
  {
    const { page, context, errors } = await open({ slides: 1 });
    assert.equal(await page.locator('.sws-controls').count(), 0);
    assert.equal(await page.locator('.sws-slider').getAttribute('data-sws-state'), 'ready');
    assert.equal(await visibleSlide(page), 0);
    assert.deepEqual(errors, []);
    await context.close();
    pass('single slide: no controls, no errors (M4.22)');
  }
  {
    const { page, context } = await open({ brokenImage: true });
    await page.locator('.sws-next').click();
    await page.waitForFunction(
      () => document.querySelector('.sws-slider').dataset.swsState === 'error',
    );
    assert.equal(await visibleSlide(page), 1, 'slide shown despite the missing image');
    assert.equal(
      await page.locator('.sws-slide:not([hidden]) img').getAttribute('alt'),
      'Fallback text',
    );
    await page.locator('.sws-next').click();
    await page.waitForFunction(
      () => document.querySelector('.sws-slider').dataset.swsState === 'ready',
    );
    await context.close();
    pass('missing image: slide readable with alt text, error state recovers (M4.22)');
  }
  console.log(`${done} accessibility checks passed`);
} finally {
  await browser.close();
}
