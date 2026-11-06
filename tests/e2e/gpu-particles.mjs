/**
 * Particle field in real Chromium with WebGL2 (TODO M10 G4): GPU result against the CPU reference,
 * spawn shape parity (GLSL vs TypeScript), determinism, numerical stability, drawing, quality tiers,
 * transitions and cleanup. Intercepted page, no WordPress writes. Run after `npm run build`.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cache = join(homedir(), '.cache/ms-playwright');
const chrome = readdirSync(cache)
  .filter((name) => /^chromium-\d+$/.test(name))
  .sort()
  .pop();

const result = await build({
  root,
  logLevel: 'silent',
  configFile: false,
  resolve: { alias: { '@gpu': join(root, 'assets/gpu'), '@shared': join(root, 'assets/shared') } },
  build: {
    write: false,
    lib: {
      entry: join(root, 'tests/e2e/gpu-harness.ts'),
      formats: ['iife'],
      name: 'harness',
      fileName: () => 'h.js',
    },
  },
});
const bundle = (Array.isArray(result) ? result[0] : result).output[0].code;
const descriptor = JSON.parse(
  readFileSync(join(root, 'schemas/effects/particle-field.json'), 'utf8'),
);

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
const tab = await browser.newPage({ viewport: { width: 900, height: 600 } });
const problems = [];
tab.on('pageerror', (error) => problems.push(error.message));
tab.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
await tab.route('http://sws.test/**', (route) =>
  route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><body style="margin:0"></body>',
  }),
);
await tab.goto('http://sws.test/');
await tab.addScriptTag({ content: bundle });
await tab.evaluate(
  ([schema, presets]) => {
    const h = window.__h;
    window.__schema = schema;
    /** Creates a device and an instance with defaults applied for `patch`. */
    window.__make = (patch, { seed = 1, quality = 'high', size = [300, 200], dpr = 1 } = {}) => {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:fixed;left:0;top:0';
      document.body.append(canvas);
      const device = h.GpuDevice.create(canvas);
      if (!device) throw new Error('no WebGL2');
      const params = h.withDefaults(schema, patch);
      const issues = h.validateParams(schema, params);
      if (issues.length) throw new Error('invalid params ' + JSON.stringify(issues));
      device.resize(size[0], size[1], dpr);
      const instance = new h.ParticleInstance({
        device,
        seed,
        params,
        quality,
        type: 'particle-field',
        schemaVersion: 1,
      });
      instance.resize({ width: size[0], height: size[1], pixelRatio: dpr });
      return { device, instance, params, canvas };
    };
    const input = (time, extra = {}) => ({
      time,
      deltaSeconds: 1 / 60,
      stepSeconds: 1 / 60,
      viewport: { width: 300, height: 200, pixelRatio: 1 },
      pointer: null,
      scroll: 0,
      reducedMotion: false,
      ...extra,
    });
    window.__run = (instance, steps, extra) => {
      for (let i = 0; i < steps; i++) instance.update(input(i / 60, extra), 1);
    };
    /** Test image: left half red, right half blue, transparent stripe in the middle. */
    window.__testImage = () => {
      const c = document.createElement('canvas');
      c.width = 80;
      c.height = 40;
      const g = c.getContext('2d');
      g.fillStyle = '#ff0000';
      g.fillRect(0, 0, 38, 40);
      g.fillStyle = '#0000ff';
      g.fillRect(42, 0, 38, 40);
      return c.toDataURL('image/png');
    };
    /** Creates the effect through the module (as the platform does), with an image asset. */
    window.__makeImage = async (
      patch,
      { seed = 1, size = [400, 200], url = window.__testImage() } = {},
    ) => {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:fixed;left:0;top:0';
      document.body.append(canvas);
      const device = h.GpuDevice.create(canvas);
      device.resize(size[0], size[1], 1);
      const params = h.withDefaults(schema, patch);
      const instance = await h.particleField.create(
        {
          device,
          backend: 'webgl2',
          seed,
          quality: 'high',
          reducedMotion: false,
          assets: { url: (key) => (key === 'image' ? url : null) },
          viewport: { width: size[0], height: size[1], pixelRatio: 1 },
        },
        params,
      );
      instance.resize({ width: size[0], height: size[1], pixelRatio: 1 });
      return { device, instance, canvas, params };
    };
    /** Colour of the canvas at a relative position (un-premultiplied by the 2D copy). */
    window.__pixel = (canvas, rx, ry) => {
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      const ctx = copy.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      const x = Math.round(rx * canvas.width),
        y = Math.round(ry * canvas.height);
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        n = 0;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const d = ctx.getImageData(x + dx, y + dy, 1, 1).data;
          r += d[0];
          g += d[1];
          b += d[2];
          a += d[3];
          n++;
        }
      return { r: r / n, g: g / n, b: b / n, a: a / n };
    };
    window.__preset = presets.find((p) => p.id === 'photo-grains');
    window.__presetParams = window.__preset.params;
    window.__presetSeed = window.__preset.seed;
    window.__magnet = presets.find((p) => p.id === 'magnetic-canvas');
    window.__input = input;
    window.__draw = (instance, device) => {
      instance.render({ target: device, input: input(0), alpha: 0 });
    };
    window.__stats = (canvas) => {
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      const ctx = copy.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
      let lit = 0,
        sx = 0,
        sy = 0,
        sum = 0;
      for (let y = 0; y < copy.height; y++)
        for (let x = 0; x < copy.width; x++) {
          const a = data[(y * copy.width + x) * 4 + 3];
          if (a > 8) {
            lit++;
            sx += x * a;
            sy += y * a;
            sum += a;
          }
        }
      return {
        lit,
        total: copy.width * copy.height,
        cx: sum ? sx / sum : 0,
        cy: sum ? sy / sum : 0,
        sum,
      };
    };
  },
  [descriptor.schema, descriptor.presets],
);
let done = 0;
const pass = (name) => console.log(`✓ ${name}`) || done++;

try {
  // GPU against the CPU reference for the deterministic operator subset.
  {
    const diff = await tab.evaluate(() => {
      const h = window.__h;
      const patch = {
        count: 600,
        spawn: {
          shape: 'sphere-volume',
          radius: 1.5,
          velocity: { mode: 'tangential', speed: 0.7 },
        },
        operators: [
          { type: 'spring-home', stiffness: 1.2, damping: 0.4, maxForce: 12 },
          { type: 'vortex', axis: [0.3, 1, 0.1], strength: 1.6, pull: 0.3 },
          {
            type: 'gravity-wells',
            wells: [
              { position: [1, 0.5, 0], mass: 2 },
              { position: [-1, 0, 0.5], mass: -1 },
            ],
          },
          { type: 'speed-limit', max: 3 },
          { type: 'drag', amount: 0.3 },
        ],
      };
      const { instance, params } = window.__make(patch, { seed: 4242 });
      const config = {
        seed: 4242,
        shape: params.spawn.shape,
        velocityMode: params.spawn.velocity.mode,
        spawn: h.spawnUniforms(params, 1.5),
        operators: h.operatorUniforms(params.operators),
      };
      const reference = h.initialState(params.count, config);
      const steps = 90;
      for (let i = 0; i < steps; i++) h.step(reference, config, 1 / 60, i);
      window.__run(instance, steps);
      const gpu = instance.readState();
      let maxPos = 0,
        maxVel = 0;
      for (let i = 0; i < params.count; i++) {
        for (let c = 0; c < 3; c++) {
          maxPos = Math.max(maxPos, Math.abs(gpu.position[i * 4 + c] - reference.pos[i * 3 + c]));
          maxVel = Math.max(maxVel, Math.abs(gpu.velocity[i * 4 + c] - reference.vel[i * 3 + c]));
        }
      }
      return { maxPos, maxVel };
    });
    console.log(
      `  max deviation after 90 steps: position ${diff.maxPos.toExponential(2)}, velocity ${diff.maxVel.toExponential(2)}`,
    );
    assert.ok(
      diff.maxPos < 2e-3 && diff.maxVel < 2e-3,
      `GPU deviates from the CPU reference: ${JSON.stringify(diff)}`,
    );
    pass('GPU simulation matches the CPU reference (spring, vortex, wells, speed limit, drag)');
  }

  // GLSL spawn functions against TypeScript for every shape and generation.
  {
    const worst = await tab.evaluate(() => {
      const h = window.__h;
      const out = {};
      for (const shape of [
        'point',
        'disc',
        'ring',
        'sphere-surface',
        'sphere-volume',
        'box',
        'line',
        'view',
      ]) {
        // Everything outside a tiny boundary respawns in every step, so after k steps each particle sits at spawn(step k-1).
        const patch = {
          count: 300,
          spawn: { shape, radius: 1.3, size: [2, 3, 4], position: [3, -0.25, 0] },
          operators: [{ type: 'bounds', mode: 'respawn', radius: 0.1 }],
        };
        const { instance, params } = window.__make(patch, { seed: 99 });
        let worst = 0;
        for (const steps of [1, 2, 5]) {
          const { instance: fresh } = window.__make(patch, { seed: 99 });
          window.__run(fresh, steps);
          const gpu = fresh.readState();
          for (let i = 0; i < params.count; i++) {
            const view = h.spawnUniforms(params, 1.5).view;
            const expected = h.spawnPosition(
              shape,
              99,
              i,
              steps - 1,
              params.spawn.radius,
              params.spawn.size,
              params.spawn.position,
              view,
            );
            for (let c = 0; c < 3; c++)
              worst = Math.max(worst, Math.abs(gpu.position[i * 4 + c] - expected[c]));
          }
        }
        out[shape] = worst;
        instance.dispose();
      }
      return out;
    });
    console.log(
      `  spawn parity (max error per shape): ${JSON.stringify(Object.fromEntries(Object.entries(worst).map(([k, v]) => [k, Number(v.toExponential(1))])))}`,
    );
    for (const [shape, error] of Object.entries(worst))
      assert.ok(error < 2e-3, `${shape}: GLSL spawn differs from TypeScript by ${error}`);
    pass(
      'GLSL spawn shapes reproduce the TypeScript reference (point, disc, ring, sphere, box, line)',
    );
  }

  // Determinism and independence of the seed.
  {
    const r = await tab.evaluate(() => {
      const patch = {
        count: 2000,
        operators: [
          { type: 'flow-field', frequency: 1, amplitude: 1.5, speed: 0.4 },
          { type: 'drag', amount: 0.3 },
        ],
      };
      const read = (seed) => {
        const { instance } = window.__make(patch, { seed });
        window.__run(instance, 120);
        const state = instance.readState();
        instance.dispose();
        return Array.from(state.position.subarray(0, 400));
      };
      const a = read(7),
        b = read(7),
        c = read(8);
      return {
        same: JSON.stringify(a) === JSON.stringify(b),
        differs: JSON.stringify(a) !== JSON.stringify(c),
      };
    });
    assert.deepEqual(r, { same: true, differs: true });
    pass('same seed reproduces the exact motion (also with GPU noise); another seed differs');
  }

  // Stability: every operator and the pointer at extreme settings stays finite and bounded.
  {
    const r = await tab.evaluate(() => {
      const patch = {
        count: 4000,
        spawn: { shape: 'box', size: [4, 4, 4], velocity: { mode: 'random', speed: 5 } },
        operators: [
          { type: 'flow-field', frequency: 6, amplitude: 20, speed: 5 },
          { type: 'vortex', axis: [0, 0, 0], center: [0, 0, 0], strength: 20, pull: -20 },
          {
            type: 'gravity-wells',
            wells: [
              { position: [0, 0, 0], mass: 50 },
              { position: [0.001, 0, 0], mass: -50 },
            ],
          },
          { type: 'speed-limit', max: 50 },
          { type: 'bounds', mode: 'bounce', radius: 6 },
        ],
        interaction: { mode: 'swirl', radius: 10, strength: 50 },
      };
      const { instance } = window.__make(patch, { seed: 5 });
      instance.handleEvent({ type: 'burst', intensity: 50 });
      window.__run(instance, 300, {
        pointer: { x: 150, y: 100, inside: true, down: true, dx: 1, dy: 1 },
      });
      const { position, velocity } = instance.readState();
      let nonFinite = 0,
        outside = 0,
        maxSpeed = 0;
      for (let i = 0; i < 4000; i++) {
        const [x, y, z] = [position[i * 4], position[i * 4 + 1], position[i * 4 + 2]];
        if (
          ![x, y, z, velocity[i * 4], velocity[i * 4 + 1], velocity[i * 4 + 2]].every(
            Number.isFinite,
          )
        )
          nonFinite++;
        else {
          if (Math.hypot(x, y, z) > 6.01) outside++;
          maxSpeed = Math.max(
            maxSpeed,
            Math.hypot(velocity[i * 4], velocity[i * 4 + 1], velocity[i * 4 + 2]),
          );
        }
      }
      return { nonFinite, outside, maxSpeed };
    });
    assert.equal(r.nonFinite, 0, 'no NaN or Infinity');
    assert.equal(r.outside, 0, 'bounds hold');
    assert.ok(r.maxSpeed <= 50.01, `speed limit holds (${r.maxSpeed})`);
    pass(
      'extreme settings, a zero axis, near-singular wells and an impulse stay finite and bounded',
    );
  }

  // Presets: each runs, draws something and stays finite.
  {
    for (const preset of descriptor.presets) {
      const r = await tab.evaluate(
        ({ params, seed }) => {
          const { device, instance, canvas } = window.__make(params, { seed, size: [400, 300] });
          window.__run(instance, 120);
          window.__draw(instance, device);
          const stats = window.__stats(canvas);
          const { position } = instance.readState(500);
          const finite = Array.from(position).every(Number.isFinite);
          instance.dispose();
          device.dispose();
          canvas.remove();
          return { ...stats, finite };
        },
        { params: preset.params, seed: preset.seed },
      );
      assert.ok(r.finite, `${preset.id}: finite state`);
      assert.ok(r.lit > 300, `${preset.id} draws visible particles (${r.lit} lit pixels)`);
      assert.ok(r.lit < r.total * 0.9, `${preset.id} leaves room around the effect`);
    }
    pass(`all ${descriptor.presets.length} presets run, draw and stay finite`);
  }

  // Drawing details: orbit camera centres the cloud; additive blending; quality tiers; pointer repels.
  {
    const r = await tab.evaluate(() => {
      const base = {
        count: 8000,
        spawn: { shape: 'sphere-volume', radius: 1 },
        appearance: { sizeMin: 2, sizeMax: 4, opacity: 0.9 },
      };
      const { device, instance, canvas } = window.__make(base, { seed: 3, size: [400, 300] });
      window.__draw(instance, device);
      const full = window.__stats(canvas);
      instance.setQuality('low');
      window.__draw(instance, device);
      const low = window.__stats(canvas);
      const counts = { low: instance.activeParticleCount };
      instance.setQuality('high');
      counts.high = instance.activeParticleCount;
      // Pointer repulsion: particles move away from a point (static field, no home).
      const clone = window.__make(
        { ...base, interaction: { mode: 'repel', radius: 1, strength: 40 } },
        { seed: 3, size: [400, 300] },
      );
      const before = clone.instance.readState(8000).position;
      window.__run(clone.instance, 20, {
        pointer: { x: 200, y: 150, inside: true, down: false, dx: 0, dy: 0 },
      });
      const after = clone.instance.readState(8000).position;
      let nearBefore = 0,
        nearAfter = 0;
      for (let i = 0; i < 8000; i++) {
        if (Math.hypot(before[i * 4], before[i * 4 + 1], before[i * 4 + 2]) < 0.3) nearBefore++;
        if (Math.hypot(after[i * 4], after[i * 4 + 1], after[i * 4 + 2]) < 0.3) nearAfter++;
      }
      return { full, low, counts, nearBefore, nearAfter };
    });
    assert.ok(
      Math.abs(r.full.cx - 200) < 12 && Math.abs(r.full.cy - 150) < 12,
      `cloud is centred (${r.full.cx.toFixed(1)}, ${r.full.cy.toFixed(1)})`,
    );
    assert.equal(r.counts.low, 2000, 'the low tier simulates a quarter of the particles');
    assert.equal(r.counts.high, 8000);
    assert.ok(r.low.sum < r.full.sum * 0.6, 'fewer particles draw less light');
    assert.ok(
      r.nearAfter < r.nearBefore * 0.5,
      `the pointer repels particles from the centre (${r.nearBefore} -> ${r.nearAfter})`,
    );
    pass('camera centres the cloud, quality tiers scale the count, the pointer repels');
  }

  // Transitions and state.
  {
    const r = await tab.evaluate(() => {
      const { device, instance } = window.__make(
        { count: 1000, appearance: { color: '#000000', sizeMax: 2 } },
        { seed: 2 },
      );
      const state = instance.captureState();
      const target = {
        ...state,
        params: {
          ...state.params,
          appearance: { ...state.params.appearance, color: '#ffffff' },
          count: 1000,
        },
      };
      instance.transitionTo(target, { durationSeconds: 1, easing: 'linear' });
      const halves = [];
      for (let i = 0; i < 60; i++) {
        instance.update(window.__input(i / 60), 1);
        if (i === 29) halves.push(instance.captureState().params.appearance.color);
      }
      halves.push(instance.captureState().params.appearance.color);
      // A count change rebuilds the particles without leaking GPU objects.
      const before = device.resourceCount;
      instance.setParams({ count: 3000 });
      const rebuilt = {
        count: instance.captureState().params.count,
        active: instance.activeParticleCount,
        sameResources: device.resourceCount === before,
      };
      instance.dispose();
      return { halves, rebuilt, left: device.resourceCount };
    });
    assert.ok(
      r.halves[0] > '#7f7f7f' || r.halves[0] === '#808080' || r.halves[0] === '#7f7f7f',
      `half-way colour ${r.halves[0]}`,
    );
    assert.equal(r.halves[1], '#ffffff');
    assert.deepEqual(r.rebuilt, { count: 3000, active: 3000, sameResources: true });
    assert.equal(r.left, 0, 'dispose releases every GPU object');
    pass(
      'parameter transitions blend smoothly; count changes rebuild without leaks; dispose frees everything',
    );
  }

  // Without a picture the effect fills the whole layer (photo-grains, any aspect ratio).
  {
    const r = await tab
      .evaluate(() => {
        const params = window.__presetParams;
        const seed = window.__presetSeed;
        const out = {};
        for (const [name, size] of [
          ['wide', [600, 250]],
          ['square', [400, 400]],
          ['tall', [250, 500]],
        ]) {
          const { device, instance, canvas } = window.__make(
            { ...params, count: 30000 },
            { seed, size },
          );
          window.__run(instance, 60);
          window.__draw(instance, device);
          const copy = document.createElement('canvas');
          copy.width = canvas.width;
          copy.height = canvas.height;
          const ctx = copy.getContext('2d');
          ctx.drawImage(canvas, 0, 0);
          const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
          // 6 x 6 grid: how many cells contain visible particles?
          const cells = new Set();
          for (let y = 0; y < copy.height; y++)
            for (let x = 0; x < copy.width; x++)
              if (data[(y * copy.width + x) * 4 + 3] > 24)
                cells.add(
                  `${Math.floor((x / copy.width) * 6)},${Math.floor((y / copy.height) * 6)}`,
                );
          out[name] = cells.size / 36;
          instance.dispose();
          device.dispose();
          canvas.remove();
        }
        return out;
      })
      .catch((e) => ({ error: String(e) }));
    assert.equal(r.error, undefined, r.error);
    for (const [name, share] of Object.entries(r))
      assert.ok(
        share >= 0.95,
        `particles cover the whole ${name} layer (${(share * 100).toFixed(0)} % of the grid cells)`,
      );
    pass('without a picture the particles cover the whole layer for wide, square and tall layers');
  }

  // Image reconstruction: the picture is recognisable, the transparent stripe stays empty.
  {
    const r = await tab.evaluate(async () => {
      const { device, instance, canvas } = await window.__makeImage({
        count: 60000,
        image: { enabled: true, assemble: 'rest', scale: 0.95 },
        appearance: {
          colorMode: 'image',
          blend: 'normal',
          opacity: 1,
          sizeMin: 1.5,
          sizeMax: 2.5,
          depthFade: 0,
        },
        camera: { projection: 'orthographic' },
      });
      window.__run(instance, 1);
      window.__draw(instance, device);
      const out = {
        left: window.__pixel(canvas, 0.25, 0.5),
        right: window.__pixel(canvas, 0.75, 0.5),
        gap: window.__pixel(canvas, 0.5, 0.5),
        count: instance.activeParticleCount,
      };
      instance.dispose();
      device.dispose();
      canvas.remove();
      return out;
    });
    assert.ok(
      r.left.r > 150 && r.left.g < 60 && r.left.b < 60,
      `left half is red: ${JSON.stringify(r.left)}`,
    );
    assert.ok(
      r.right.b > 150 && r.right.r < 60 && r.right.g < 60,
      `right half is blue: ${JSON.stringify(r.right)}`,
    );
    assert.ok(r.gap.a < 30, `the transparent stripe stays empty: ${JSON.stringify(r.gap)}`);
    pass('an image becomes thousands of coloured particles; transparent areas stay empty');
  }

  // Scatter: particles start spread out and assemble into the picture.
  {
    const r = await tab
      .evaluate(async () => {
        const preset = window.__preset;
        const { device, instance, canvas } = await window.__makeImage(
          {
            ...preset.params,
            count: 30000,
            appearance: { ...preset.params.appearance, sizeMin: 1.5, sizeMax: 2.5 },
          },
          { seed: preset.seed },
        );
        const speed = () => {
          const { velocity } = instance.readState(3000);
          let sum = 0;
          for (let i = 0; i < 3000; i++)
            sum += Math.hypot(velocity[i * 4], velocity[i * 4 + 1], velocity[i * 4 + 2]);
          return sum / 3000;
        };
        const spread0 = (() => {
          const { position } = instance.readState(3000);
          let max = 0;
          for (let i = 0; i < 3000; i++)
            max = Math.max(
              max,
              Math.hypot(position[i * 4], position[i * 4 + 1], position[i * 4 + 2]),
            );
          return max;
        })();
        window.__run(instance, 1);
        const speedEarly = speed();
        window.__run(instance, 420);
        const speedLate = speed();
        window.__draw(instance, device);
        const out = {
          spread0,
          speedEarly,
          speedLate,
          left: window.__pixel(canvas, 0.25, 0.5),
          right: window.__pixel(canvas, 0.75, 0.5),
        };
        instance.dispose();
        device.dispose();
        canvas.remove();
        return out;
      })
      .catch((e) => ({ error: String(e) }));
    assert.equal(r.error, undefined, r.error);
    assert.ok(r.spread0 > 1.5, `particles start scattered (${r.spread0})`);
    assert.ok(
      r.speedLate > 0.01 && r.speedLate < 1,
      `the dust keeps drifting gently instead of freezing (${r.speedEarly} -> ${r.speedLate})`,
    );
    assert.ok(
      r.left.r > 120 && r.left.r > r.left.b * 2,
      `assembled picture, left red: ${JSON.stringify(r.left)}`,
    );
    assert.ok(
      r.right.b > 120 && r.right.b > r.right.r * 2,
      `assembled picture, right blue: ${JSON.stringify(r.right)}`,
    );
    pass('scattered particles spring into the picture (photo-grains preset)');
  }

  // Magnet: the pointer pulls particles out of the picture locally; they return when it leaves.
  {
    const r = await tab
      .evaluate(async () => {
        const preset = window.__magnet;
        const { device, instance } = await window.__makeImage(
          { ...preset.params, count: 20000 },
          { seed: preset.seed },
        );
        const N = 20000;
        window.__run(instance, 1);
        const rest = Array.from(instance.readState(N).position);
        const pointerAt = (x) => ({ x, y: 100, inside: true, down: false, dx: 4, dy: 0 });
        for (let i = 0; i < 40; i++)
          instance.update(window.__input(i / 60, { pointer: pointerAt(120 + i * 4) }), 1);
        const moved = Array.from(instance.readState(N).position);
        const displacement = (i) =>
          Math.hypot(
            moved[i * 4] - rest[i * 4],
            moved[i * 4 + 1] - rest[i * 4 + 1],
            moved[i * 4 + 2] - rest[i * 4 + 2],
          );
        // World x of the pointer path: ndc = x / 400 * 2 - 1, orthographic half height 2.33 -> half width 4.66.
        const worldX = (px) => ((px / 400) * 2 - 1) * 4.663;
        let near = 0,
          nearMoved = 0,
          far = 0,
          farMoved = 0,
          maxNear = 0;
        for (let i = 0; i < N; i++) {
          const x = rest[i * 4],
            y = rest[i * 4 + 1];
          const dx = Math.max(0, worldX(120) - x, x - worldX(280));
          const distance = Math.hypot(dx, y);
          const d = displacement(i);
          if (distance < 0.5) {
            near++;
            if (d > 0.05) nearMoved++;
            maxNear = Math.max(maxNear, d);
          } else if (distance > 2.2) {
            far++;
            if (d > 0.01) farMoved++;
          }
        }
        for (let i = 40; i < 340; i++)
          instance.update(window.__input(i / 60, { pointer: null }), 1);
        const back = Array.from(instance.readState(N).position);
        let worstReturn = 0;
        for (let i = 0; i < N; i++)
          worstReturn = Math.max(
            worstReturn,
            Math.hypot(
              back[i * 4] - rest[i * 4],
              back[i * 4 + 1] - rest[i * 4 + 1],
              back[i * 4 + 2] - rest[i * 4 + 2],
            ),
          );
        instance.dispose();
        device.dispose();
        return { near, nearMoved, far, farMoved, maxNear, worstReturn };
      })
      .catch((e) => ({ error: String(e) }));
    assert.equal(r.error, undefined, r.error);
    assert.ok(
      r.near > 200 && r.nearMoved / r.near > 0.4,
      `particles near the pointer are pulled out (${r.nearMoved}/${r.near}, max ${r.maxNear.toFixed(2)})`,
    );
    assert.ok(r.maxNear > 0.15, 'displacement is clearly visible');
    assert.ok(
      r.far > 500 && r.farMoved === 0,
      `the disturbance stays local (${r.farMoved}/${r.far} far particles moved)`,
    );
    assert.ok(
      r.worstReturn < 0.03,
      `every particle returns to its home (worst ${r.worstReturn.toFixed(4)})`,
    );
    pass(
      'magnetic pointer disturbs the picture locally and the particles return (magnetic-canvas preset)',
    );
  }

  // Failures: unreadable image rejects (stage shows the fallback), a missing asset just runs without a picture.
  {
    const r = await tab.evaluate(async () => {
      const out = {};
      try {
        await window.__makeImage(
          { count: 100, image: { enabled: true } },
          { url: 'http://sws.test/missing.png' },
        );
        out.broken = 'resolved';
      } catch {
        out.broken = 'rejected';
      }
      const { instance, device } = await window.__makeImage(
        { count: 100, image: { enabled: true } },
        { url: null },
      );
      window.__run(instance, 5);
      out.withoutAsset = instance.readState(10).position.every(Number.isFinite);
      instance.dispose();
      device.dispose();
      return out;
    });
    assert.deepEqual(r, { broken: 'rejected', withoutAsset: true });
    pass(
      'an unreadable image rejects creation (fallback image shown); a missing asset runs without a picture',
    );
  }

  // Cost: throughput numbers (software rendering, so only a lower bound for real GPUs).
  {
    const r = await tab.evaluate(() => {
      const out = {};
      for (const count of [20000, 100000]) {
        const { device, instance, canvas } = window.__make(
          {
            count,
            operators: [
              { type: 'flow-field', frequency: 1, amplitude: 1, speed: 0.3 },
              { type: 'drag', amount: 0.2 },
            ],
          },
          { seed: 1, size: [600, 400] },
        );
        for (let i = 0; i < 3; i++) {
          window.__run(instance, 1);
          window.__draw(instance, device);
        }
        const sync = () =>
          device.gl.readPixels(
            0,
            0,
            1,
            1,
            device.gl.RGBA,
            device.gl.UNSIGNED_BYTE,
            new Uint8Array(4),
          ); // blocks until the GPU is done
        sync();
        const start = performance.now();
        const frames = 20;
        for (let i = 0; i < frames; i++) {
          window.__run(instance, 1);
          window.__draw(instance, device);
        }
        sync();
        out[count] = (performance.now() - start) / frames;
        instance.dispose();
        device.dispose();
        canvas.remove();
      }
      return out;
    });
    console.log(
      `  per frame (update + draw, software GL): 20k particles ${r[20000].toFixed(1)} ms, 100k particles ${r[100000].toFixed(1)} ms`,
    );
    assert.ok(
      Number.isFinite(r[20000]) && r[20000] > 0,
      'a frame with 20,000 particles completes (software GL: the number is informational)',
    );
    pass('throughput measured for 20,000 and 100,000 particles');
  }
  assert.deepEqual(problems, []);
  console.log(`${done} particle checks passed`);
} finally {
  await browser.close();
}
