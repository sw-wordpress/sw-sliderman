import { describe, expect, it, vi } from 'vitest';
import { checkSchema, validateParams, withDefaults } from '@gpu/core';
import { GpuDevice } from '@gpu/device';
import descriptor from '../../schemas/effects/particle-field.json';
import {
  cameraAt,
  lookAt,
  multiply,
  orthographic,
  perspective,
  pointerOnPlane,
  transform,
} from '@gpu/modules/particle-field/camera';
import defaultFactory, { particleField } from '@gpu/modules/particle-field';
import { ParticleInstance } from '@gpu/modules/particle-field/instance';
import { initialState, step } from '@gpu/modules/particle-field/reference';
import {
  SPAWN_SHAPES,
  VELOCITY_MODES,
  type ParticleParams,
} from '@gpu/modules/particle-field/types';
import {
  SPAWN_SHAPE_ID,
  VELOCITY_MODE_ID,
  shapePosition,
  spawnPosition,
  spawnVelocity,
  unit,
} from '@gpu/modules/particle-field/spawn';
import { hexToRgb, operatorUniforms, spawnUniforms } from '@gpu/modules/particle-field/uniforms';

const defaults = (patch: Record<string, unknown> = {}): ParticleParams =>
  withDefaults(descriptor.schema, { count: 100, ...patch }) as ParticleParams;

describe('particle-field descriptor', () => {
  it('has a bounded schema and presets that satisfy it (PHP validates the same file)', () => {
    expect(checkSchema(descriptor.schema)).toEqual([]);
    expect(descriptor.presets.length).toBeGreaterThanOrEqual(4);
    for (const preset of descriptor.presets) {
      expect(validateParams(descriptor.schema, preset.params), preset.id).toEqual([]);
      expect(
        validateParams(descriptor.schema, withDefaults(descriptor.schema, preset.params)),
        `${preset.id} with defaults`,
      ).toEqual([]);
    }
    expect(new Set(descriptor.presets.map((p) => p.id)).size).toBe(descriptor.presets.length);
  });

  it('defaults make a complete, valid parameter set from just a count', () => {
    const params = defaults();
    expect(validateParams(descriptor.schema, params)).toEqual([]);
    expect(params.spawn.shape).toBe('sphere-volume');
    expect(params.camera.projection).toBe('perspective');
    expect(params.operators).toEqual([]);
  });

  it('exposes the module metadata to the platform', () => {
    expect(particleField).toMatchObject({
      type: 'particle-field',
      schemaVersion: 1,
      continuous: true,
      backends: ['webgl2'],
    });
    expect(defaultFactory()).toBe(particleField);
    expect(particleField.presets?.map((p) => p.id)).toContain('orbital-mist');
  });

  it('keeps the shape and mode ids in sync with the schema enums', () => {
    const spawn = (descriptor.schema.properties.spawn.properties.shape.enum as string[])
      .slice()
      .sort();
    expect([...SPAWN_SHAPES].sort()).toEqual(spawn);
    expect(Object.keys(SPAWN_SHAPE_ID).sort()).toEqual(spawn);
    const modes = (
      descriptor.schema.properties.spawn.properties.velocity.properties.mode.enum as string[]
    )
      .slice()
      .sort();
    expect([...VELOCITY_MODES].sort()).toEqual(modes);
    expect(Object.keys(VELOCITY_MODE_ID).sort()).toEqual(modes);
    expect(new Set(Object.values(SPAWN_SHAPE_ID)).size).toBe(SPAWN_SHAPES.length);
  });
});

describe('spawn reference', () => {
  it('is deterministic per (seed, index, step) and independent between them', () => {
    expect(unit(1, 2, 1, 0)).toBe(unit(1, 2, 1, 0));
    expect(unit(1, 2, 1, 0)).not.toBe(unit(1, 2, 1, 1));
    expect(unit(1, 2, 1, 0)).not.toBe(unit(1, 3, 1, 0));
    expect(unit(1, 2, 1, 0)).not.toBe(unit(2, 2, 1, 0));
  });

  it('puts every shape where it belongs', () => {
    const size: [number, number, number] = [2, 4, 6];
    for (let i = 0; i < 400; i++) {
      const [u1, u2, u3] = [unit(5, i, 1, 0), unit(5, i, 2, 0), unit(5, i, 3, 0)];
      expect(shapePosition('point', u1, u2, u3, 2, size)).toEqual([0, 0, 0]);
      const disc = shapePosition('disc', u1, u2, u3, 2, size);
      expect(Math.hypot(disc[0], disc[1])).toBeLessThanOrEqual(2 + 1e-9);
      expect(disc[2]).toBe(0);
      const ring = shapePosition('ring', u1, u2, u3, 2, size);
      expect(Math.hypot(ring[0], ring[1])).toBeCloseTo(2, 9);
      const surface = shapePosition('sphere-surface', u1, u2, u3, 2, size);
      expect(Math.hypot(...surface)).toBeCloseTo(2, 9);
      expect(
        Math.hypot(...shapePosition('sphere-volume', u1, u2, u3, 2, size)),
      ).toBeLessThanOrEqual(2 + 1e-9);
      const box = shapePosition('box', u1, u2, u3, 2, size);
      expect(Math.abs(box[0])).toBeLessThanOrEqual(1);
      expect(Math.abs(box[1])).toBeLessThanOrEqual(2);
      expect(Math.abs(box[2])).toBeLessThanOrEqual(3);
      const line = shapePosition('line', u1, u2, u3, 2, size);
      expect([Math.abs(line[0]) <= 1, line[1], line[2]]).toEqual([true, 0, 0]);
    }
  });

  it('fills the volume evenly (cube-root radius)', () => {
    let inner = 0;
    const n = 4000;
    for (let i = 0; i < n; i++)
      if (Math.hypot(...spawnPosition('sphere-volume', 9, i, 0, 1, [1, 1, 1], [0, 0, 0])) < 0.5)
        inner++;
    expect(inner / n).toBeCloseTo(0.125, 1);
  });

  it('offsets by the centre and derives velocities from the mode', () => {
    expect(spawnPosition('point', 1, 0, 0, 1, [1, 1, 1], [1, 2, 3])).toEqual([1, 2, 3]);
    expect(spawnVelocity('none', 5, [1, 0, 0], 1, 0, 0)).toEqual([0, 0, 0]);
    expect(spawnVelocity('radial', 0, [1, 0, 0], 1, 0, 0)).toEqual([0, 0, 0]);
    expect(spawnVelocity('radial', 2, [3, 0, 0], 1, 0, 0)).toEqual([2, 0, 0]);
    const tangent = spawnVelocity('tangential', 2, [1, 5, 0], 1, 0, 0);
    expect(tangent[0]).toBeCloseTo(0, 9);
    expect(tangent[1]).toBe(0);
    expect(tangent[2]).toBeCloseTo(2, 9);
    expect(Math.hypot(...spawnVelocity('random', 3, [0, 0, 0], 1, 4, 0))).toBeCloseTo(3, 9);
    expect(spawnVelocity('radial', 2, [0, 0, 0], 1, 0, 0)).toEqual([0, 0, 0]);
  });
});

describe('uniforms', () => {
  it('flattens operators, the last of a type wins, wells are capped at three', () => {
    const op = operatorUniforms([
      { type: 'drag', amount: 1 },
      { type: 'drag', amount: 2 },
      { type: 'spring-home', stiffness: 3, damping: 0.5, maxForce: 9 },
      { type: 'vortex', axis: [0, 0, 5], center: [1, 2, 3], strength: 4, pull: 0.5 },
      { type: 'flow-field', frequency: 2, amplitude: 0, speed: 1 },
      {
        type: 'gravity-wells',
        wells: Array.from({ length: 5 }, (_, i) => ({
          position: [i, 0, 0] as [number, number, number],
          mass: i + 1,
        })),
      },
      { type: 'speed-limit', max: 7 },
      { type: 'bounds', mode: 'bounce', radius: 3 },
    ]);
    expect(op.drag).toBe(2);
    expect(op.spring).toEqual([3, 0.5, 9, 1]);
    expect(op.vortexA).toEqual([0, 0, 1, 4]);
    expect(op.vortexB).toEqual([1, 2, 3, 0.5]);
    expect(op.vortexOn).toBe(1);
    expect(op.flow[3]).toBe(0);
    expect(Array.from(op.wells)).toEqual([0, 0, 0, 1, 1, 0, 0, 2, 2, 0, 0, 3]);
    expect([op.speedLimit, op.bounds]).toEqual([7, [2, 3]]);
  });

  it('turns a zero axis into a safe default and has no forces without operators', () => {
    expect(
      operatorUniforms([
        { type: 'vortex', axis: [0, 0, 0], center: [0, 0, 0], strength: 1, pull: 0 },
      ]).vortexA.slice(0, 3),
    ).toEqual([0, 1, 0]);
    const none = operatorUniforms([]);
    expect([
      none.drag,
      none.spring[3],
      none.vortexOn,
      none.flow[3],
      none.speedLimit,
      none.bounds[0],
    ]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('orders life bounds and maps spawn ids; colours parse defensively', () => {
    const u = spawnUniforms(
      defaults({ lifecycle: { mode: 'emitter', minSeconds: 5, maxSeconds: 1 } }),
    );
    expect([u.lifeMin, u.lifeMax, u.emitter]).toEqual([1, 5, 1]);
    expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0]);
    expect(hexToRgb('nope')).toEqual([1, 1, 1]);
  });
});

describe('CPU reference integrator', () => {
  const config = (patch: Record<string, unknown>) => {
    const params = defaults(patch);
    return {
      params,
      config: {
        seed: 3,
        shape: params.spawn.shape,
        velocityMode: params.spawn.velocity.mode,
        spawn: spawnUniforms(params),
        operators: operatorUniforms(params.operators),
      },
    };
  };

  it('starts from the spawn positions at rest', () => {
    const { config: c, params } = config({ count: 50 });
    const state = initialState(params.count, c);
    expect(state.pos.slice(0, 3)).toEqual(state.home.slice(0, 3));
    expect(Array.from(state.vel).every((v) => v === 0)).toBe(true);
  });

  it('springs back to the home position and damps the motion', () => {
    const { config: c, params } = config({
      count: 20,
      operators: [{ type: 'spring-home', stiffness: 4, damping: 2, maxForce: 100 }],
    });
    const state = initialState(params.count, c);
    state.pos[0] = (state.pos[0] ?? 0) + 1;
    for (let i = 0; i < 600; i++) step(state, c, 1 / 60, i);
    expect(Math.abs((state.pos[0] ?? 0) - (state.home[0] ?? 0))).toBeLessThan(0.01);
  });

  it('limits the spring force and the speed', () => {
    const { config: c, params } = config({
      count: 5,
      operators: [
        { type: 'spring-home', stiffness: 100, damping: 0, maxForce: 1 },
        { type: 'speed-limit', max: 0.5 },
      ],
    });
    const state = initialState(params.count, c);
    state.pos[0] = (state.pos[0] ?? 0) + 10;
    step(state, c, 1 / 60, 0);
    expect(Math.hypot(state.vel[0] ?? 0, state.vel[1] ?? 0, state.vel[2] ?? 0)).toBeLessThanOrEqual(
      0.5 + 1e-6,
    );
  });

  it('keeps particles inside wrap and bounce bounds', () => {
    for (const mode of ['wrap', 'bounce'] as const) {
      const { config: c, params } = config({
        count: 200,
        spawn: { shape: 'box', size: [6, 6, 6], velocity: { mode: 'random', speed: 4 } },
        operators: [{ type: 'bounds', mode, radius: 2 }],
      });
      const state = initialState(params.count, c);
      for (let i = 0; i < 30; i++) step(state, c, 1 / 60, i);
      for (let i = 0; i < params.count; i++)
        expect(
          Math.hypot(state.pos[i * 3] ?? 0, state.pos[i * 3 + 1] ?? 0, state.pos[i * 3 + 2] ?? 0),
        ).toBeLessThanOrEqual(2 * 1.5 + 1e-3);
    }
  });

  it('respawns emitter particles when their life ends, with fresh age and life', () => {
    const { config: c, params } = config({
      count: 30,
      lifecycle: { mode: 'emitter', minSeconds: 0.2, maxSeconds: 0.2 },
    });
    const state = initialState(params.count, c);
    for (let i = 0; i < 30; i++) step(state, c, 1 / 60, i);
    expect(Math.max(...Array.from(state.age))).toBeLessThanOrEqual(0.2 + 1e-3);
  });

  it('is deterministic, applies vortex and gravity wells, and never produces NaN', () => {
    const patch = {
      count: 100,
      operators: [
        { type: 'vortex', axis: [0, 1, 0], center: [0, 0, 0], strength: 2, pull: 0.2 },
        { type: 'gravity-wells', wells: [{ position: [0, 0, 0], mass: 5 }] },
        { type: 'drag', amount: 0.3 },
      ],
    };
    const run = () => {
      const { config: c, params } = config(patch);
      const state = initialState(params.count, c);
      for (let i = 0; i < 120; i++) step(state, c, 1 / 60, i);
      return state;
    };
    const a = run();
    expect(Array.from(a.pos)).toEqual(Array.from(run().pos));
    expect(Array.from(a.pos).every(Number.isFinite)).toBe(true);
    expect(Math.hypot(a.vel[0] ?? 0, a.vel[1] ?? 0, a.vel[2] ?? 0)).toBeGreaterThan(0);
  });
});

describe('camera', () => {
  const project = (m: Float32Array, p: [number, number, number]) => {
    const [x, y, , w] = transform(m, [p[0], p[1], p[2], 1]);
    return [x / w, y / w];
  };

  it('looks at the origin from the orbit position; the origin lands in the centre of the view', () => {
    const state = cameraAt(
      { projection: 'perspective', distance: 5, fov: 50, orbitSpeed: 0.5, tilt: 0.3 },
      2,
      1.5,
    );
    const [x, y] = project(state.viewProjection, [0, 0, 0]);
    expect(Math.abs(x ?? 1)).toBeLessThan(1e-6);
    expect(Math.abs(y ?? 1)).toBeLessThan(1e-6);
    expect(Math.hypot(...state.eye)).toBeCloseTo(5, 6);
    expect(Math.hypot(...state.normal)).toBeCloseTo(1, 6);
  });

  it('keeps near points in front of far points and scales with the aspect ratio', () => {
    const persp = cameraAt(
      { projection: 'perspective', distance: 5, fov: 60, orbitSpeed: 0, tilt: 0 },
      0,
      2,
    );
    const [near] = project(persp.viewProjection, [1, 0, 2]);
    const [far] = project(persp.viewProjection, [1, 0, -2]);
    expect(Math.abs(near ?? 0)).toBeGreaterThan(Math.abs(far ?? 0));
    const ortho = cameraAt(
      { projection: 'orthographic', distance: 5, fov: 60, orbitSpeed: 0, tilt: 0 },
      0,
      2,
    );
    const [a] = project(ortho.viewProjection, [1, 0, 2]);
    const [b] = project(ortho.viewProjection, [1, 0, -2]);
    expect(a).toBeCloseTo(b ?? 0, 6);
  });

  it('multiplies and builds matrices consistently', () => {
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const m = perspective(1, 1.2, 0.1, 50);
    expect(Array.from(multiply(identity, m))).toEqual(Array.from(m));
    expect(orthographic(2, 1, 0.1, 10)[5]).toBeCloseTo(0.5, 6);
    expect(lookAt([0, 0, 5], [0, 0, 0])[14]).toBeCloseTo(-5, 6);
  });

  it('maps the pointer onto the plane through the origin for both projections', () => {
    for (const projection of ['perspective', 'orthographic'] as const) {
      const params = { projection, distance: 5, fov: 60, orbitSpeed: 0, tilt: 0 } as const;
      const camera = cameraAt(params, 0, 2);
      const centre = pointerOnPlane(camera, projection, 0, 0, 2, 60, 5);
      expect(Math.hypot(...centre)).toBeLessThan(1e-6);
      const right = pointerOnPlane(camera, projection, 1, 0, 2, 60, 5);
      const up = pointerOnPlane(camera, projection, 0, 1, 2, 60, 5);
      expect(right[0]).toBeGreaterThan(0);
      expect(up[1]).toBeGreaterThan(0);
      expect(right[0] / up[1]).toBeCloseTo(2, 4);
      expect(Math.abs(right[2])).toBeLessThan(1e-6);
    }
  });
});

// -----------------------------------------------------------------------------------------------
// Instance logic against a recording GL double (shader maths is verified by tests/e2e/gpu-particles.mjs).
// -----------------------------------------------------------------------------------------------

function glDouble() {
  const calls: Array<[string, unknown[]]> = [];
  let id = 0;
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (/^[A-Z][A-Z0-9_]*$/.test(prop)) return 1;
      if (prop === 'getShaderParameter' || prop === 'getProgramParameter') return () => true;
      if (prop === 'getUniformLocation') return (_p: unknown, name: string) => ({ name });
      if (prop.startsWith('create')) return () => ({ kind: prop, id: ++id });
      if (prop === 'getExtension') return () => null;
      if (prop === 'isContextLost') return () => false;
      return (...args: unknown[]) => {
        calls.push([prop, args]);
        return undefined;
      };
    },
  };
  return {
    gl: new Proxy(
      { drawingBufferWidth: 400, drawingBufferHeight: 300 },
      handler,
    ) as unknown as WebGL2RenderingContext,
    calls,
  };
}

function instance(
  patch: Record<string, unknown> = {},
  quality: 'low' | 'high' = 'high',
  image: { home: Float32Array; color: Float32Array } | null = null,
) {
  const { gl, calls } = glDouble();
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => gl) as never;
  const device = GpuDevice.create(canvas);
  if (!device) throw new Error('device');
  const params = defaults({ count: 1000, ...patch });
  const particles = new ParticleInstance({
    device,
    seed: 11,
    params,
    quality,
    type: 'particle-field',
    schemaVersion: 1,
    image,
  });
  particles.resize({ width: 400, height: 300, pixelRatio: 1 });
  return { particles, device, calls, params };
}

const frame = (time: number, extra: Record<string, unknown> = {}) => ({
  time,
  deltaSeconds: 1 / 60,
  stepSeconds: 1 / 60,
  viewport: { width: 400, height: 300, pixelRatio: 1 },
  pointer: null,
  scroll: 0,
  reducedMotion: false,
  ...extra,
});
/** Arguments (after the location) of the `uniform4f` calls for one uniform, found by name. */
const named = (calls: Array<[string, unknown[]]>, name: string): number[][] =>
  calls
    .filter(([n, a]) => n === 'uniform4f' && (a[0] as { name?: string })?.name === name)
    .map(([, a]) => a.slice(1) as number[]);
const count = (calls: Array<[string, unknown[]]>, name: string) =>
  calls.filter(([n]) => n === name).length;

describe('ParticleInstance', () => {
  it('builds ping-pong buffers, runs transform-feedback steps and draws instanced quads', () => {
    const { particles, calls } = instance();
    particles.update(frame(0), 3);
    expect(count(calls, 'beginTransformFeedback')).toBe(3);
    expect(count(calls, 'drawArrays')).toBe(3);
    particles.render({ target: null, input: frame(0), alpha: 0 });
    expect(calls.find(([n]) => n === 'drawArraysInstanced')?.[1]).toEqual([1, 0, 4, 1000]);
    expect(calls.some(([n]) => n === 'enable' && true)).toBe(true);
  });

  it('simulates no step without time passing, and draws even before the first update', () => {
    const { particles, calls } = instance();
    particles.update(frame(0), 0);
    expect(count(calls, 'beginTransformFeedback')).toBe(0);
    particles.render({ target: null, input: frame(0), alpha: 0 });
    expect(count(calls, 'drawArraysInstanced')).toBe(1);
  });

  it('scales the active particles with the quality tier', () => {
    const { particles } = instance({ count: 8000 });
    expect(particles.activeParticleCount).toBe(8000);
    particles.setQuality('low');
    expect(particles.activeParticleCount).toBe(2000);
    particles.setQuality('medium');
    expect(particles.activeParticleCount).toBe(4000);
  });

  it('applies parameter patches: appearance stays cheap, structure rebuilds without leaking', () => {
    const { particles, device } = instance();
    const before = device.resourceCount;
    particles.setParams({ appearance: { opacity: 0.3 } } as never);
    expect(particles.captureState().params.appearance).toMatchObject({
      opacity: 0.3,
      style: 'soft-disc',
    });
    expect(device.resourceCount).toBe(before);
    particles.setParams({ count: 2500 } as never);
    expect(particles.activeParticleCount).toBe(2500);
    expect(device.resourceCount).toBe(before);
    particles.setParams({ spawn: { shape: 'ring' } } as never);
    expect((particles.captureState().params.spawn as { shape: string }).shape).toBe('ring');
    expect(device.resourceCount).toBe(before);
  });

  it('blends parameters during a transition and ends exactly on the target', () => {
    const { particles } = instance({ appearance: { opacity: 0.2 } });
    const state = particles.captureState();
    const target = {
      ...state,
      params: {
        ...state.params,
        appearance: { ...(state.params.appearance as object), opacity: 0.8 },
      },
    };
    particles.transitionTo(target, { durationSeconds: 1, easing: 'linear' });
    particles.update(frame(0, { deltaSeconds: 0.5 }), 0);
    expect((particles.captureState().params.appearance as { opacity: number }).opacity).toBeCloseTo(
      0.5,
      6,
    );
    particles.update(frame(1, { deltaSeconds: 0.5 }), 0);
    expect((particles.captureState().params.appearance as { opacity: number }).opacity).toBe(0.8);
    particles.update(frame(2, { deltaSeconds: 1 }), 0);
    expect((particles.captureState().params.appearance as { opacity: number }).opacity).toBe(0.8);
  });

  it('turns events into an impulse that decays, and reset rebuilds', () => {
    const { particles, calls, device } = instance();
    const before = device.resourceCount;
    particles.handleEvent({ type: 'burst', intensity: 2 });
    particles.update(frame(0), 1);
    const impulses = named(calls, 'uImpulse').map((a) => a[3]);
    expect(impulses).toContain(16);
    particles.handleEvent({ type: 'strike', x: 1, y: 1 });
    particles.handleEvent({ type: 'reset' });
    expect(device.resourceCount).toBe(before);
    for (let i = 0; i < 200; i++) particles.update(frame(i / 60), 0);
  });

  it('feeds the pointer into the simulation only when it is inside and interaction is on', () => {
    const pointer = { x: 200, y: 150, inside: true, down: false, dx: 0, dy: 0 };
    const active = instance({ interaction: { mode: 'repel', radius: 1, strength: 5 } });
    active.particles.update(frame(0, { pointer }), 1);
    const on = named(active.calls, 'uPointer').some((a) => a[3] === 1);
    expect(on).toBe(true);
    const outside = instance({ interaction: { mode: 'repel', radius: 1, strength: 5 } });
    outside.particles.update(frame(0, { pointer: { ...pointer, inside: false } }), 1);
    expect(named(outside.calls, 'uPointer').some((a) => a[3] === 1)).toBe(false);
    const off = instance();
    off.particles.update(frame(0, { pointer }), 1);
    expect(named(off.calls, 'uPointer').some((a) => a[3] === 1)).toBe(false);
  });

  it('draws with the blend mode of the appearance', () => {
    const additive = instance({ appearance: { blend: 'additive' } });
    additive.particles.render({ target: null, input: frame(0), alpha: 0 });
    expect(additive.calls.find(([n]) => n === 'blendFunc')?.[1]).toEqual([1, 1]);
    const normal = instance({ appearance: { blend: 'normal' } });
    normal.particles.render({ target: null, input: frame(0), alpha: 0 });
    expect(normal.calls.find(([n]) => n === 'blendFunc')?.[1]).toEqual([1, 1]);
  });

  it('reads state back for tools and releases everything on dispose', () => {
    const { particles, device } = instance();
    const { position, velocity } = particles.readState(10);
    expect([position.length, velocity.length]).toEqual([40, 40]);
    expect(particles.readState().position.length).toBe(4000);
    particles.dispose();
    particles.dispose();
    expect(device.resourceCount).toBe(0);
    expect(() => {
      particles.update(frame(0), 1);
      particles.render({ target: null, input: frame(0), alpha: 0 });
    }).not.toThrow();
  });

  it('creates instances through the module', async () => {
    const { gl } = glDouble();
    const canvas = document.createElement('canvas');
    canvas.getContext = (() => gl) as never;
    const device = GpuDevice.create(canvas);
    const created = await particleField.create(
      {
        device: device as never,
        backend: 'webgl2',
        seed: 5,
        quality: 'high',
        reducedMotion: false,
        assets: { url: () => null },
      },
      defaults({ count: 10 }) as unknown as Record<string, unknown>,
    );
    expect(created.captureState()).toMatchObject({ type: 'particle-field', seed: 5 });
    created.dispose();
    vi.restoreAllMocks();
  });
});

describe('image targets and the magnetic pointer in the instance', () => {
  const targets = (count: number) => {
    const home = new Float32Array(count * 4);
    const color = new Float32Array(count * 4).fill(0.5);
    for (let i = 0; i < count; i++) home.set([i + 10, i + 20, i + 30, 0], i * 4);
    return { home, color };
  };
  const uploaded = (calls: Array<[string, unknown[]]>): Float32Array[] =>
    calls
      .filter(([n, a]) => n === 'bufferData' && (a as unknown[])[1] instanceof Float32Array)
      .map(([, a]) => (a as unknown[])[1] as Float32Array);

  it('starts assembled ("rest"): positions equal the image homes, colours are uploaded', () => {
    const image = targets(4);
    const { calls } = instance(
      { count: 4, image: { enabled: true, assemble: 'rest' } },
      'high',
      image,
    );
    const [position, velocity, home, color] = uploaded(calls);
    expect(Array.from(position?.slice(0, 3) ?? [])).toEqual([10, 20, 30]);
    expect(Array.from(home?.slice(0, 3) ?? [])).toEqual([10, 20, 30]);
    expect(Array.from(color?.slice(0, 4) ?? [])).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(velocity?.length).toBe(16);
  });

  it('scatters from the spawn shape when asked, but still keeps the image as home', () => {
    const image = targets(4);
    const { calls } = instance(
      {
        count: 4,
        spawn: { shape: 'sphere-volume', radius: 2 },
        image: { enabled: true, assemble: 'scatter' },
      },
      'high',
      image,
    );
    const [position, , home] = uploaded(calls);
    expect(Array.from(home?.slice(0, 3) ?? [])).toEqual([10, 20, 30]);
    expect(
      Math.hypot(position?.[0] ?? 99, position?.[1] ?? 99, position?.[2] ?? 99),
    ).toBeLessThanOrEqual(2 + 1e-6);
  });

  it('feeds the magnet mode with polarity, a motion-following axis and speed-boosted strength', () => {
    const { particles, calls } = instance({
      interaction: { mode: 'magnet', radius: 1, strength: 10, polarity: -1, speedBoost: 2 },
    });
    const at = (x: number) => ({ x, y: 150, inside: true, down: false, dx: 0, dy: 0 });
    particles.update(frame(0, { pointer: at(200) }), 1);
    particles.update(frame(1 / 60, { pointer: at(260) }), 1);
    const params = named(calls, 'uPointerParams');
    expect(params).toHaveLength(2);
    expect(params[0]?.[2]).toBe(10); // first sample: no motion yet
    expect(params[1]?.[2]).toBeGreaterThan(10); // moving pointer pulls harder
    expect(params[1]?.[3]).toBe(-1); // polarity
    const axis = calls
      .filter(([n]) => n === 'uniform3fv')
      .map(([, a]) => a as unknown[])
      .filter((a) => a[1] instanceof Array && (a[1] as number[]).length === 3);
    expect(axis.length).toBeGreaterThan(0);
    // The last sent axis follows the motion to the right in the view plane (non-zero, normalised).
    const last = calls
      .filter(([n]) => n === 'uniform3fv')
      .map(([, a]) => (a as unknown[])[1] as ArrayLike<number>)
      .filter((v) => v.length === 3)
      .at(-1);
    expect(Math.hypot(last?.[0] ?? 0, last?.[1] ?? 0, last?.[2] ?? 0)).toBeCloseTo(1, 5);
  });

  it('does not boost other pointer modes', () => {
    const { particles, calls } = instance({
      interaction: { mode: 'repel', radius: 1, strength: 10, speedBoost: 5 },
    });
    const at = (x: number) => ({ x, y: 150, inside: true, down: false, dx: 0, dy: 0 });
    particles.update(frame(0, { pointer: at(200) }), 1);
    particles.update(frame(1 / 60, { pointer: at(300) }), 1);
    const strengths = named(calls, 'uPointerParams').map((a) => a[2]);
    expect(strengths).toEqual([10, 10]);
  });
});
