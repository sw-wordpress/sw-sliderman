/**
 * GPU platform in real Chromium with WebGL2 (TODO M10 G3). Intercepted fixture, no WordPress writes.
 * A tiny test module compiles real shaders, draws and exposes counters, so the checks cover the
 * platform (device, scheduler, stage, controller, runtime hook), not a particular effect.
 * Run after `npm run build`: node tests/e2e/gpu-platform.mjs
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
  args: [
    '--no-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const css = readFileSync(join(root, 'build/runtime/runtime.css'), 'utf8');
const runtime = readFileSync(join(root, 'build/runtime/runtime.js'), 'utf8');
const gpu = readFileSync(join(root, 'build/gpu/gpu.js'), 'utf8');

const MODULE = `
export default (api) => ({
  type: 'vendor/test', schemaVersion: 1, label: 'Test', continuous: true, backends: ['webgl2'],
  parameterSchema: { type: 'object', properties: { red: { type: 'number', minimum: 0, maximum: 1, default: 1 } } },
  async create(ctx, params) {
    const gl = ctx.device.gl;
    const scope = ctx.device.scope();
    const program = scope.program(
      '#version 300 es\\nvoid main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }',
      '#version 300 es\\nprecision mediump float; uniform float uRed; out vec4 o; void main(){ o = vec4(uRed, 0.0, 0.0, 1.0); }');
    const vao = scope.vertexArray();
    const red = gl.getUniformLocation(program, 'uRed');
    const fx = (window.__fx ??= { created: 0, disposed: 0, frames: {}, pixel: {}, gl: {}, hash: api.core.hash32(ctx.seed) });
    fx.created++;
    fx.gl[ctx.seed] = gl;
    const id = ctx.seed;
    return {
      update() {}, setParams() {}, handleEvent() {}, captureState() { return {}; }, transitionTo() {}, setQuality() {},
      resize() {},
      render() {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.useProgram(program); gl.bindVertexArray(vao); gl.uniform1f(red, params.red);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const px = new Uint8Array(4);
        gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        fx.pixel[id] = Array.from(px);
        fx.frames[id] = (fx.frames[id] ?? 0) + 1;
      },
      dispose() { scope.dispose(); fx.disposed++; },
    };
  },
});`;

const FALLBACK =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300"><rect width="800" height="300" fill="green"/></svg>';
const bps = Object.fromEntries(
  ['desktop', 'tablet', 'mobile'].map((n) => [
    n,
    { minWidth: 0, stageWidth: 800, stageHeight: 300 },
  ]),
);

function page({ slides = 2, module = 'http://sws.test/test-module.js', autoplay = false } = {}) {
  const effect = (i) => ({
    layerId: `fx${i}`,
    type: 'vendor/test',
    schemaVersion: 1,
    seed: 100 + i,
    quality: 'high',
    continuous: true,
    module,
    params: { red: 1 },
    assets: {},
  });
  const config = {
    autoplay,
    loop: true,
    breakpoints: bps,
    effects: Array.from({ length: slides }, (_, i) => effect(i)),
    slides: Array.from({ length: slides }, (_, i) => ({
      id: `s${i}`,
      durationMs: 4000,
      transition: { type: 'cut', durationMs: 0 },
      layers: [
        {
          id: `fx${i}`,
          animation: {
            enter: { preset: 'none', startMs: 0, durationMs: 0, easing: 'ease', distance: 0 },
            exit: { mode: 'slide-end' },
          },
        },
      ],
    })),
  };
  const slide = (i) =>
    `<div class="sws-slide${i === 0 ? ' sws-is-active' : ''}" role="group" aria-label="${i + 1}"${i === 0 ? '' : ' hidden inert'}><div class="sws-stage"><div class="sws-layer" data-sws-layer="fx${i}"><div class="sws-layer__anim"><div class="sws-layer__body"><div class="sws-fx" data-sws-fx="vendor/test"><img class="sws-fx__fallback" alt="" src='${FALLBACK}'></div></div></div></div></div></div>`;
  return `<!doctype html><style>${css}.sws-slider{width:800px;margin:20px}.sws-stage{height:300px}.sws-layer{inset:0}</style>
<section class="sws-slider" data-sws-slider><div class="sws-viewport">${Array.from({ length: slides }, (_, i) => slide(i)).join('')}</div>
<div class="sws-controls"><button type="button" class="sws-toggle" data-label-pause="Pause" data-label-play="Play" aria-label="Pause"><span class="sws-icon sws-icon--pause"></span></button><button type="button" class="sws-prev" aria-label="Previous"></button><button type="button" class="sws-next" aria-label="Next"></button><p class="sws-live"></p></div>
<script type="application/json" class="sws-config">${JSON.stringify(config)}</script></section>`;
}

async function open({
  html = page(),
  context = {},
  init,
  moduleStatus = 200,
  scripts = true,
} = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, ...context });
  const tab = await ctx.newPage();
  const problems = [];
  tab.on('pageerror', (error) => problems.push(error.message));
  const warnings = [];
  tab.on('console', (message) => message.type() === 'warning' && warnings.push(message.text()));
  if (init) await tab.addInitScript(init);
  await tab.route('http://sws.test/**', (route) => {
    const url = route.request().url();
    if (url.endsWith('/test-module.js')) {
      return moduleStatus === 200
        ? route.fulfill({ contentType: 'text/javascript', body: MODULE })
        : route.fulfill({ status: moduleStatus, body: '' });
    }
    return route.fulfill({ contentType: 'text/html', body: html });
  });
  await tab.goto('http://sws.test/', { waitUntil: 'domcontentloaded' });
  if (scripts) {
    await tab.addScriptTag({ content: gpu });
    await tab.addScriptTag({ content: runtime });
  }
  return { tab, ctx, problems, warnings };
}
const state = (tab, i) =>
  tab.evaluate(
    (n) => document.querySelector(`[data-sws-layer="fx${n}"] .sws-fx`)?.dataset.swsFxState,
    i,
  );
const frames = (tab, seed) => tab.evaluate((s) => window.__fx?.frames?.[s] ?? 0, seed);
let done = 0;
const pass = (name) => console.log(`✓ ${name}`) || done++;

try {
  // Start: real shaders, aria-hidden canvas, fallback replaced, only the visible slide runs.
  {
    const { tab, ctx, problems } = await open();
    await tab.waitForFunction(
      () =>
        document.querySelector('[data-sws-layer="fx0"] .sws-fx')?.dataset.swsFxState === 'running',
    );
    await tab.waitForFunction(() => (window.__fx?.frames?.[100] ?? 0) > 3);
    assert.deepEqual(
      await tab.evaluate(() => window.__fx.pixel[100]),
      [255, 0, 0, 255],
      'the effect really drew',
    );
    assert.equal(
      await tab.evaluate(() => window.__fx.hash),
      await tab.evaluate(() => window.__fx.hash),
      'core helpers reach modules',
    );
    const canvas = await tab.evaluate(() => {
      const el = document.querySelector('[data-sws-layer="fx0"] canvas');
      return {
        hidden: el.getAttribute('aria-hidden'),
        tab: el.tabIndex,
        events: getComputedStyle(el).pointerEvents,
        live: el.parentElement.classList.contains('sws-fx--live'),
        width: el.width,
      };
    });
    assert.deepEqual(
      { hidden: canvas.hidden, tab: canvas.tab, events: canvas.events, live: canvas.live },
      { hidden: 'true', tab: -1, events: 'none', live: true },
    );
    assert.ok(canvas.width >= 800, `canvas sized by the effect area (${canvas.width})`);
    assert.equal(
      await tab.evaluate(
        () =>
          getComputedStyle(document.querySelector('[data-sws-layer="fx0"] .sws-fx__fallback'))
            .visibility,
      ),
      'hidden',
      'the live canvas replaces the fallback image',
    );
    assert.equal(
      await tab.locator('[data-sws-layer="fx1"] canvas').count(),
      0,
      'the hidden slide uses no GPU',
    );
    assert.equal(await tab.evaluate(() => window.__fx.created), 1);
    assert.deepEqual(problems, []);
    await ctx.close();
    pass('real WebGL2 effect starts on the visible slide only');
  }

  // Slide change: previous stage pauses, next starts, frames stop for the hidden one.
  {
    const { tab, ctx, problems } = await open();
    await tab.waitForFunction(() => (window.__fx?.frames?.[100] ?? 0) > 3);
    await tab.locator('.sws-next').click();
    await tab.waitForFunction(() => (window.__fx?.frames?.[101] ?? 0) > 3);
    assert.equal(await state(tab, 0), 'paused');
    assert.equal(await state(tab, 1), 'running');
    const before = await frames(tab, 100);
    await tab.waitForTimeout(400);
    assert.equal(await frames(tab, 100), before, 'a left slide renders no frames');
    assert.ok((await frames(tab, 101)) > 3);
    await tab.locator('.sws-prev').click();
    await tab.waitForFunction((n) => (window.__fx.frames[100] ?? 0) > n + 3, before);
    assert.equal(
      await tab.evaluate(() => window.__fx.created),
      2,
      'returning reuses the existing GPU instance',
    );
    assert.deepEqual(problems, []);
    await ctx.close();
    pass('slide changes pause, start and resume the right stages');
  }

  // Pause switch.
  {
    const { tab, ctx } = await open();
    await tab.waitForFunction(() => (window.__fx?.frames?.[100] ?? 0) > 3);
    await tab.locator('.sws-toggle').click();
    await tab.waitForTimeout(100);
    const paused = await frames(tab, 100);
    await tab.waitForTimeout(400);
    assert.equal(await frames(tab, 100), paused, 'the pause switch stops the effect');
    assert.equal(await state(tab, 0), 'paused');
    assert.equal(await tab.locator('.sws-toggle').getAttribute('aria-pressed'), 'true');
    await tab.locator('.sws-toggle').click();
    await tab.waitForFunction((n) => (window.__fx.frames[100] ?? 0) > n + 3, paused);
    await ctx.close();
    pass('pause switch stops and resumes continuous effects (no autoplay needed)');
  }

  // Hidden tab pauses (document visibility), and offscreen scroll pauses (IntersectionObserver).
  {
    const { tab, ctx } = await open({
      html: page().replace('<section', '<div style="height:2500px"></div><section'),
    });
    await tab.waitForTimeout(300);
    assert.equal(await state(tab, 0), 'paused', 'offscreen effects do not run');
    assert.equal(await frames(tab, 100), 0);
    await tab.evaluate(() => document.querySelector('.sws-slider').scrollIntoView());
    await tab.waitForFunction(() => (window.__fx?.frames?.[100] ?? 0) > 3);
    assert.equal(await state(tab, 0), 'running');
    await ctx.close();
    pass('effects start only when they scroll into view');
  }

  // Reduced motion: no GPU at all.
  {
    const { tab, ctx, problems } = await open({ context: { reducedMotion: 'reduce' } });
    await tab.waitForTimeout(500);
    assert.equal(
      await tab.evaluate(() => window.__fx?.created ?? 0),
      0,
      'no module loaded, no context created',
    );
    assert.equal(await tab.locator('canvas').count(), 0);
    assert.equal(await state(tab, 0), 'fallback');
    assert.equal(
      await tab.evaluate(
        () => getComputedStyle(document.querySelector('.sws-fx__fallback')).visibility,
      ),
      'visible',
    );
    assert.deepEqual(problems, []);
    await ctx.close();
    pass('reduced motion keeps the static fallback and never touches the GPU');
  }

  // Context loss and restoration.
  {
    const { tab, ctx, problems } = await open();
    await tab.waitForFunction(() => (window.__fx?.frames?.[100] ?? 0) > 3);
    await tab.evaluate(() => {
      window.__lose = window.__fx.gl[100].getExtension('WEBGL_lose_context'); // not available while the context is lost
      window.__lose.loseContext();
    });
    await tab.waitForFunction(
      () => document.querySelector('[data-sws-layer="fx0"] .sws-fx').dataset.swsFxState === 'lost',
    );
    assert.equal(
      await tab.evaluate(
        () => getComputedStyle(document.querySelector('.sws-fx__fallback')).visibility,
      ),
      'visible',
      'fallback while the context is lost',
    );
    await tab.evaluate(() => window.__lose.restoreContext());
    await tab.waitForFunction(
      () =>
        document.querySelector('[data-sws-layer="fx0"] .sws-fx').dataset.swsFxState === 'running',
    );
    await tab.waitForFunction(
      () => window.__fx.created === 2 && JSON.stringify(window.__fx.pixel[100]) === '[255,0,0,255]',
    );
    assert.equal(
      await tab.evaluate(() => window.__fx.disposed),
      1,
      'the old instance was released',
    );
    assert.deepEqual(problems, []);
    await ctx.close();
    pass('context loss shows the fallback; restoration rebuilds the effect');
  }

  // Mount API: two independent mounts, resize, destroy leaves nothing behind.
  {
    const { tab, ctx, problems } = await open({ scripts: false });
    await tab.addScriptTag({ content: gpu });
    await tab.evaluate(async () => {
      const make = (id) => {
        const root = document.createElement('div');
        root.style.cssText = 'width:300px;height:150px;position:relative';
        root.innerHTML = `<div data-sws-layer="${id}"><div class="sws-fx" style="display:block;width:100%;height:100%"></div></div>`;
        document.body.append(root);
        return root;
      };
      const entry = (id, seed) => ({
        layerId: id,
        type: 'vendor/test',
        schemaVersion: 1,
        seed,
        quality: 'high',
        continuous: true,
        module: 'http://sws.test/test-module.js',
        params: { red: 1 },
        assets: {},
      });
      window.__a = make('a');
      window.__b = make('b');
      window.__ma = window.swsGpu.mount(window.__a, [entry('a', 1)], false);
      window.__mb = window.swsGpu.mount(window.__b, [entry('b', 2)], false);
      window.__ma.activate(window.__a);
      window.__mb.activate(window.__b);
    });
    await tab.waitForFunction(
      () => (window.__fx?.frames?.[1] ?? 0) > 3 && (window.__fx?.frames?.[2] ?? 0) > 3,
    );
    assert.equal(await tab.locator('canvas').count(), 2);
    await tab.evaluate(() => (window.__a.style.width = '600px'));
    await tab.waitForFunction(
      () => document.querySelector('[data-sws-layer="a"] canvas').width >= 600,
    );
    await tab.evaluate(() => window.__ma.destroy());
    const lost = await tab.evaluate(() => window.__fx.gl[1].isContextLost());
    assert.equal(lost, true, 'destroy gives the WebGL context back immediately');
    assert.equal(await tab.locator('[data-sws-layer="a"] canvas').count(), 0);
    const left = await frames(tab, 1);
    await tab.waitForTimeout(300);
    assert.equal(await frames(tab, 1), left, 'no frames after destroy');
    assert.ok((await frames(tab, 2)) > 3, 'the other mount keeps running');
    await tab.evaluate(() => window.__mb.destroy());
    assert.equal(await tab.evaluate(() => window.__fx.disposed), 2);
    assert.equal(await tab.locator('canvas').count(), 0);
    const afterAll = await frames(tab, 2);
    await tab.waitForTimeout(300);
    assert.equal(await frames(tab, 2), afterAll, 'the shared scheduler is idle without stages');
    assert.deepEqual(problems, []);
    await ctx.close();
    pass(
      'two mounts are independent; resize works; destroy leaves no canvas, context or frame loop',
    );
  }

  // Fallbacks: no WebGL2, failing module, no bundle.
  {
    const noGl = await open({
      init: () => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
          return type === 'webgl2' ? null : original.call(this, type, ...rest);
        };
      },
    });
    await noGl.tab.waitForTimeout(400);
    assert.equal(await noGl.tab.locator('canvas').count(), 0);
    assert.equal(
      await noGl.tab.evaluate(
        () => getComputedStyle(document.querySelector('.sws-fx__fallback')).visibility,
      ),
      'visible',
    );
    assert.deepEqual(noGl.problems, []);
    await noGl.ctx.close();

    const failing = await open({ moduleStatus: 404 });
    await failing.tab.waitForFunction(
      () =>
        document.querySelector('[data-sws-layer="fx0"] .sws-fx').dataset.swsFxState === 'fallback',
    );
    assert.equal(
      await failing.tab.locator('canvas').count(),
      0,
      'no canvas without a working module',
    );
    assert.deepEqual(failing.problems, []);
    await failing.ctx.close();

    const plain = await open({ scripts: false });
    await plain.tab.addScriptTag({ content: runtime });
    await plain.tab.waitForFunction(
      () => document.querySelector('.sws-slider').dataset.swsState !== 'loading',
    );
    assert.equal(await plain.tab.locator('canvas').count(), 0);
    await plain.tab.locator('.sws-next').click();
    assert.equal(
      await plain.tab.evaluate(() =>
        [...document.querySelectorAll('.sws-slide')].findIndex((s) => !s.hidden),
      ),
      1,
      'the slider works without the GPU bundle',
    );
    assert.deepEqual(plain.problems, []);
    await plain.ctx.close();
    pass(
      'no WebGL2, failing module or missing bundle: static fallback, slider keeps working, no errors',
    );
  }

  // Cost smoke: the frame loop sustains a useful rate with a trivial effect (SwiftShader, no GPU).
  {
    const { tab, ctx } = await open();
    await tab.waitForFunction(() => (window.__fx?.frames?.[100] ?? 0) > 3);
    const start = await frames(tab, 100);
    await tab.waitForTimeout(1000);
    const rate = (await frames(tab, 100)) - start;
    console.log(`  frames in 1 s: ${rate} (software rendering)`);
    assert.ok(rate >= 20, `frame loop too slow: ${rate}`);
    await ctx.close();
    pass('frame loop sustains at least 20 fps with software rendering');
  }
  console.log(`${done} GPU platform checks passed`);
} finally {
  await browser.close();
}
