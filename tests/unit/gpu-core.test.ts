import { describe, expect, it, vi } from 'vitest';
import {
  AdaptiveQuality,
  EffectConfigError,
  EffectRegistry,
  EffectUnavailableError,
  FixedStepper,
  QUALITY_PROFILES,
  QUALITY_TIERS,
  blend,
  ease,
  hash32,
  hashAt,
  mulberry32,
  resolveTier,
  toUnit,
  unitAt,
  type EffectConfig,
  type EffectContext,
  type EffectInstance,
  type EffectModule,
} from '@gpu/core';

describe('rng', () => {
  it('hash32 matches the golden values the GLSL implementation must reproduce', () => {
    expect([0, 1, 2, 12345, 0xffffffff].map(hash32)).toEqual([
      129708002, 2831084092, 2055130248, 4099845390, 3861530882,
    ]);
    expect(
      [
        [0, 0, 0],
        [7319, 0, 0],
        [7319, 1, 0],
        [7319, 1, 1],
        [7319, 19999, 3],
      ].map(([seed, index, stream]) => hashAt(seed ?? 0, index ?? 0, stream ?? 0)),
    ).toEqual([817759070, 1873381035, 3946764573, 4226900379, 2035523698]);
  });

  it('is deterministic, in range and well spread', () => {
    expect(unitAt(7319, 5, 2)).toBe(unitAt(7319, 5, 2));
    expect(unitAt(7319, 5, 2)).not.toBe(unitAt(7320, 5, 2));
    expect(unitAt(7319, 5, 2)).not.toBe(unitAt(7319, 5, 3));
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const value = unitAt(42, i);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      sum += value;
    }
    expect(sum / 20000).toBeCloseTo(0.5, 1);
    expect(toUnit(0xffffffff)).toBeLessThan(1);
    expect(toUnit(0)).toBe(0);
  });

  it('mulberry32 is reproducible per seed', () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(mulberry32(6)()).not.toBe(mulberry32(5)());
  });
});

describe('FixedStepper', () => {
  it('produces the same number of steps regardless of the display rate', () => {
    for (const hz of [30, 60, 120, 144]) {
      const stepper = new FixedStepper();
      let steps = 0;
      for (let frame = 0; frame < hz * 2; frame++) steps += stepper.advance(1 / hz).steps;
      expect(Math.abs(steps - 120)).toBeLessThanOrEqual(1);
    }
  });

  it('caps long frames, drops the backlog and ignores invalid deltas', () => {
    const stepper = new FixedStepper({ maxFrameSeconds: 1, maxSteps: 3 });
    const result = stepper.advance(10);
    expect(result.steps).toBe(3);
    expect(result.dropped).toBeGreaterThan(0);
    expect(stepper.advance(0).steps).toBe(0);
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(stepper.advance(bad).steps).toBe(0);
  });

  it('reports the interpolation fraction and can be reset', () => {
    const stepper = new FixedStepper();
    const r = stepper.advance(1 / 60 + 1 / 120);
    expect(r.steps).toBe(1);
    expect(r.alpha).toBeCloseTo(0.5, 5);
    stepper.reset();
    expect(stepper.advance(0).alpha).toBe(0);
  });
});

describe('AdaptiveQuality', () => {
  const feed = (quality: AdaptiveQuality, ms: number, frames: number): Array<string | null> =>
    Array.from({ length: frames }, () => quality.sample(ms));

  it('steps down after sustained slow frames, one tier at a time', () => {
    const quality = new AdaptiveQuality({ start: 'ultra' });
    const changes = feed(quality, 30, 200).filter(Boolean);
    expect(changes[0]).toBe('high');
    expect(quality.tier).not.toBe('ultra');
  });

  it('stays calm on good frame times and does not oscillate (hysteresis and cooldown)', () => {
    const quality = new AdaptiveQuality({ start: 'high', max: 'high' });
    expect(feed(quality, 16, 1000).filter(Boolean)).toEqual([]);
    const slow = new AdaptiveQuality({ start: 'high' });
    feed(slow, 30, 60);
    const tier = slow.tier;
    expect(feed(slow, 8, 200).filter(Boolean)).toEqual([]); // cooldown blocks an immediate upgrade
    expect(slow.tier).toBe(tier);
  });

  it('upgrades after a long calm period and respects min and max', () => {
    const quality = new AdaptiveQuality({ start: 'medium', min: 'medium', max: 'high' });
    expect(feed(quality, 30, 500).filter(Boolean)).toEqual([]); // already at the minimum
    const up = new AdaptiveQuality({ start: 'medium', max: 'high' });
    expect(feed(up, 8, 400).filter(Boolean)).toEqual(['high']);
    expect(feed(up, 8, 2000).filter(Boolean)).toEqual([]);
  });

  it('ignores hidden-tab and invalid frame times', () => {
    const quality = new AdaptiveQuality({ start: 'high' });
    expect(feed(quality, 5000, 100).filter(Boolean)).toEqual([]);
    expect(quality.sample(Number.NaN)).toBeNull();
    expect(quality.sample(-1)).toBeNull();
  });

  it('profiles get cheaper towards low and resolve the tier', () => {
    const scales = QUALITY_TIERS.map((tier) => QUALITY_PROFILES[tier].countScale);
    expect([...scales].sort((a, b) => a - b)).toEqual(scales);
    expect(resolveTier('auto', 'medium')).toBe('medium');
    expect(resolveTier('low', 'ultra')).toBe('low');
  });
});

describe('transition', () => {
  it('eases within bounds', () => {
    for (const name of ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const) {
      expect(ease(name, 0)).toBe(0);
      expect(ease(name, 1)).toBe(1);
      expect(ease(name, -5)).toBe(0);
      expect(ease(name, 5)).toBe(1);
    }
    expect(ease('ease-in', 0.5)).toBeLessThan(0.5);
    expect(ease('ease-out', 0.5)).toBeGreaterThan(0.5);
  });

  it('interpolates numbers, vectors and colours; endpoints are exact', () => {
    const from = { size: 2, color: '#000000', position: [0, 10, 20] };
    const to = { size: 4, color: '#ffffff', position: [10, 20, 40] };
    expect(blend(from, to, 0)).toEqual(from);
    expect(blend(from, to, 1)).toEqual(to);
    expect(blend(from, to, 0.5)).toEqual({ size: 3, color: '#808080', position: [5, 15, 30] });
  });

  it('switches discrete values and one-sided keys at 50 %', () => {
    const from = { mode: 'repel', only: 1, flag: false };
    const to = { mode: 'attract', other: 2, flag: true };
    expect(blend(from, to, 0.25)).toEqual({ mode: 'repel', only: 1, flag: false });
    expect(blend(from, to, 0.75)).toEqual({ mode: 'attract', other: 2, flag: true });
    expect(blend([1, 2], [1, 2, 3], 0.2)).toEqual([1, 2]);
    expect(blend([1, 2], [1, 2, 3], 0.8)).toEqual([1, 2, 3]);
  });

  it('never shares references with its inputs', () => {
    const from = { v: [1, 2] };
    const result = blend(from, { v: [3, 4] }, 0) as { v: number[] };
    expect(result.v).not.toBe(from.v);
  });
});

const schema = {
  type: 'object',
  required: ['size'],
  properties: {
    size: { type: 'number', minimum: 1, maximum: 10, default: 2 },
    tint: { type: 'string', maxLength: 7, format: 'color', default: '#ffffff' },
  },
};

function makeModule(
  type: string,
  overrides: Partial<EffectModule> = {},
): EffectModule & { created: Array<Record<string, unknown>> } {
  const created: Array<Record<string, unknown>> = [];
  const instance = { dispose: vi.fn() } as unknown as EffectInstance;
  return {
    type,
    schemaVersion: 2,
    label: 'Test',
    continuous: true,
    backends: ['webgl2'],
    parameterSchema: schema,
    create: (_context: EffectContext, params: Record<string, unknown>) => {
      created.push(params);
      return Promise.resolve(instance);
    },
    created,
    ...overrides,
  };
}
const context: EffectContext = {
  device: null,
  backend: 'webgl2',
  seed: 1,
  quality: 'high',
  reducedMotion: false,
  assets: { url: () => null },
};
const config = (patch: Partial<EffectConfig> = {}): EffectConfig => ({
  type: 'test',
  schemaVersion: 2,
  params: {},
  ...patch,
});

describe('EffectRegistry', () => {
  it('creates an instance with defaults applied and validated parameters', async () => {
    const registry = new EffectRegistry();
    const module = makeModule('test');
    registry.register(module);
    await registry.create(config({ params: { size: 5 } }), context);
    expect(module.created).toEqual([{ size: 5, tint: '#ffffff' }]);
    expect(registry.has('test')).toBe(true);
    expect(registry.types()).toEqual(['test']);
  });

  it('rejects invalid parameters with the issue list and never creates the effect', async () => {
    const registry = new EffectRegistry();
    const module = makeModule('test');
    registry.register(module);
    const error = await registry
      .create(config({ params: { size: 99, extra: true } }), context)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EffectConfigError);
    expect((error as EffectConfigError).issues).toEqual(
      expect.arrayContaining([
        { path: '/size', code: 'range' },
        { path: '/extra', code: 'unknown_key' },
      ]),
    );
    expect(module.created).toEqual([]);
  });

  it('loads lazily once, shares concurrent loads and does not cache failures', async () => {
    const registry = new EffectRegistry();
    let attempts = 0;
    const module = makeModule('vendor/glow');
    registry.registerLoader('vendor/glow', () => {
      attempts++;
      return attempts === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(module);
    });
    await expect(registry.load('vendor/glow')).rejects.toBeInstanceOf(EffectUnavailableError);
    const [a, b] = await Promise.all([registry.load('vendor/glow'), registry.load('vendor/glow')]);
    expect(a).toBe(b);
    expect(attempts).toBe(2);
    await registry.load('vendor/glow');
    expect(attempts).toBe(2);
  });

  it('reports unknown types as unavailable', async () => {
    const registry = new EffectRegistry();
    await expect(registry.create(config({ type: 'missing' }), context)).rejects.toMatchObject({
      reason: 'unknown',
    });
  });

  it('refuses duplicates, bad type ids, modules of the wrong type and unbounded schemas', async () => {
    const registry = new EffectRegistry();
    registry.register(makeModule('test'));
    expect(() => registry.register(makeModule('test'))).toThrow(/already registered/);
    expect(() => registry.registerLoader('test', () => Promise.reject(new Error('x')))).toThrow();
    expect(() => registry.register(makeModule('Bad Id'))).toThrow(EffectUnavailableError);
    expect(() => registry.register(makeModule('x'.repeat(65)))).toThrow(EffectUnavailableError);
    expect(() =>
      registry.register(makeModule('other', { parameterSchema: { type: 'number' } })),
    ).toThrow(EffectUnavailableError);
    registry.registerLoader('lazy', () => Promise.resolve(makeModule('not-lazy')));
    await expect(registry.load('lazy')).rejects.toMatchObject({ reason: 'invalid_module' });
  });

  it('upgrades older parameter versions and rejects unknown versions', async () => {
    const registry = new EffectRegistry();
    const migrate = vi.fn((params: Record<string, unknown>) => ({ size: Number(params.big) }));
    const module = makeModule('test', { migrate });
    registry.register(module);
    await registry.create(config({ schemaVersion: 1, params: { big: 4 } }), context);
    expect(migrate).toHaveBeenCalledWith({ big: 4 }, 1);
    expect(module.created).toEqual([{ size: 4, tint: '#ffffff' }]);
    await expect(registry.create(config({ schemaVersion: 3 }), context)).rejects.toMatchObject({
      issues: [{ path: '/schemaVersion', code: 'schema_version' }],
    });
    const plain = new EffectRegistry();
    plain.register(makeModule('test'));
    await expect(plain.create(config({ schemaVersion: 1 }), context)).rejects.toBeInstanceOf(
      EffectConfigError,
    );
  });
});
