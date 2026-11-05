/** Native Chromium checks; isolated markup and local bundles, no WordPress writes. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cache = join(homedir(), '.cache/ms-playwright');
const chrome = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name)).sort().pop();
const browser = await chromium.launch({ executablePath: [join(cache, chrome, 'chrome-linux/chrome'), join(cache, chrome, 'chrome-linux64/chrome')].find(existsSync), args: ['--no-sandbox'] });
const css = readFileSync(join(root, 'build/runtime/runtime.css'), 'utf8');
const runtime = readFileSync(join(root, 'build/runtime/runtime.js'), 'utf8');
const effects = readFileSync(join(root, 'build/runtime/effects.js'), 'utf8');
assert.ok(!runtime.includes('linear-gradient(90deg'), 'decorative implementation stays out of the base bundle');
const errors = [];
const config = (enabled) => ({
  autoplay: false, loop: true,
  breakpoints: Object.fromEntries(['desktop', 'tablet', 'mobile'].map((name) => [name, { minWidth: 0, stageWidth: 1000, stageHeight: 500 }])),
  slides: ['a', 'b'].map((id) => ({
    id, durationMs: 6000, transition: { type: 'fade', durationMs: 400 },
    effects: { cinematic: enabled, lightSweep: enabled },
    layers: [{ id, animation: { enter: { preset: id === 'a' ? 'reveal-left' : 'reveal-circle', startMs: 200, durationMs: 900, easing: 'ease-out', distance: 0 }, exit: { mode: 'slide-end' } } }],
  })),
});
const markup = (id, enabled) => `<section id="${id}" class="sws-slider" data-sws-slider>
  <div class="sws-viewport">${['a', 'b'].map((slide, index) => `<div class="sws-slide ${index === 0 ? 'sws-is-active' : ''}" ${index === 0 ? '' : 'hidden inert'}>
    <img class="sws-slide__bg sws-fit-cover" alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1000' height='500'%3E%3Crect width='1000' height='500' fill='%231d1742'/%3E%3Ccircle cx='800' cy='100' r='300' fill='%234f2678'/%3E%3C/svg%3E">
    <div class="sws-stage"><div class="sws-layer" data-sws-layer="${slide}"><div class="sws-layer__anim"><div class="sws-layer__body"><p class="sws-text">A little brilliance.</p><a class="sws-button" href="#details">Explore</a></div></div></div></div></div>`).join('')}</div>
  <div class="sws-controls"><button class="sws-next">Next</button></div><script class="sws-config" type="application/json">${JSON.stringify(config(enabled))}</script></section>`;
const html = `<style>${css}.sws-slider{max-width:1100px;margin:20px auto}.sws-stage{aspect-ratio:2}.sws-layer{left:8%;top:30%;width:80%;height:50%;font:clamp(20px,5vw,64px)/1.1 system-ui;color:white}.sws-layer__body{transform:rotate(-2deg)}.sws-button{font-size:16px;width:140px;height:44px;margin-top:20px;background:#bb95ff;color:#1d1742}</style>${markup('hero', true)}${markup('plain', false)}`;
try {
  for (const width of [1180, 820, 375]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setContent(html);
    assert.equal(await page.locator('#hero .sws-slide:not([hidden])').count(), 1, 'static fallback');
    assert.equal(await page.locator('.sws-light-sweep').count(), 0);
    await page.addScriptTag({ content: effects });
    await page.addScriptTag({ content: runtime });
    await page.waitForFunction(() => document.querySelector('#hero .sws-light-sweep'));
    assert.equal(await page.locator('#plain .sws-light-sweep').count(), 0, 'effects remain per slider');
    const initial = await page.locator('#hero').evaluate((hero) => {
      const layer = hero.querySelector('.sws-is-active .sws-layer__anim');
      for (const animation of hero.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = 700; }
      return { mask: getComputedStyle(layer).clipPath, rotation: getComputedStyle(layer.firstElementChild).transform, sweep: hero.querySelector('.sws-light-sweep').style.pointerEvents };
    });
    assert.ok(initial.mask.startsWith('inset('), 'native masked reveal');
    assert.notEqual(initial.rotation, 'none', 'user rotation survives');
    assert.equal(initial.sweep, 'none', 'decoration never intercepts input');
    await page.locator('#hero .sws-next').click();
    await page.waitForFunction(() => document.querySelector('#hero .sws-is-active [data-sws-layer="b"]'));
    const prepared = await page.locator('#hero .sws-is-active .sws-layer__anim').evaluate((el) => ({ mask: getComputedStyle(el).clipPath, state: el.getAnimations()[0]?.playState }));
    assert.equal(prepared.state, 'paused', 'entrance waits for slide transition');
    assert.ok(prepared.mask.startsWith('circle(0%'), 'incoming circular reveal starts masked');
    await page.waitForTimeout(450);
    for (let click = 0; click < 3; click++) await page.locator('#hero .sws-next').click();
    await page.waitForTimeout(450);
    assert.equal(await page.locator('#hero .sws-slide:not([hidden])').count(), 1, 'rapid navigation settles');
    assert.ok(await page.locator('#hero .sws-light-sweep').count() <= 1, 'no stale decorations');
    await page.mouse.move(width - 1, 899);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelectorAll('.sws-light-sweep').length === 0);
    assert.equal(await page.locator('#hero').evaluate((el) => el.getAnimations({ subtree: true }).length), 0, 'live reduced-motion cancels effects and masks');
    await page.locator('#hero .sws-next').click();
    assert.equal(await page.locator('#hero .sws-slide:not([hidden])').count(), 1);
    assert.equal(await page.locator('#hero .sws-is-active .sws-layer__anim').evaluate((el) => getComputedStyle(el).clipPath), 'none');
    await page.close();
  }
  // Initial reduced-motion preference prevents even the first effect frame.
  const reduced = await browser.newPage({ reducedMotion: 'reduce' });
  await reduced.setContent(html);
  await reduced.addScriptTag({ content: effects });
  await reduced.addScriptTag({ content: runtime });
  await reduced.waitForTimeout(100);
  assert.equal(await reduced.locator('.sws-light-sweep').count(), 0);
  assert.equal(await reduced.locator('#hero').evaluate((el) => el.getAnimations({ subtree: true }).length), 0);
  await reduced.close();
  assert.deepEqual(errors, []);
  console.log('✓ hero effects: 1180/820/375 px, isolated instances, native masks, transition preparation, live/initial reduced motion and static fallback');
} finally {
  await browser.close();
}
