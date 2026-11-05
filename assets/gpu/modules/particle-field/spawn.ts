import { hashAt, toUnit } from '@gpu/core/rng';
import type { SpawnShape, Vec3, VelocityMode } from './types';

/**
 * CPU reference of the spawn functions. The GLSL copy in shaders.ts must produce the same
 * positions for the same `(seed, index, stream, step)`; tests/e2e/gpu-particles.mjs compares them.
 */

/** Random streams per quantity, so quantities are independent. */
export const STREAM = {
  u1: 1,
  u2: 2,
  u3: 3,
  size: 4,
  life: 5,
  age: 6,
  velA: 7,
  velB: 8,
  palette: 9,
  phase: 10,
} as const;

export const SPAWN_SHAPE_ID: Readonly<Record<SpawnShape, number>> = {
  point: 0,
  disc: 1,
  ring: 2,
  'sphere-surface': 3,
  'sphere-volume': 4,
  box: 5,
  line: 6,
};
export const VELOCITY_MODE_ID: Readonly<Record<VelocityMode, number>> = {
  none: 0,
  radial: 1,
  tangential: 2,
  random: 3,
};

const TAU = Math.PI * 2;

/** Uniform random number for a particle, quantity and generation (`step`: 0 for the first spawn). */
export function unit(seed: number, index: number, stream: number, step: number): number {
  return toUnit(hashAt((seed + Math.imul(step, 0x9e3779b1)) >>> 0, index, stream));
}

/** Position on the spawn shape relative to its centre, from three uniform numbers. */
export function shapePosition(
  shape: SpawnShape,
  u1: number,
  u2: number,
  u3: number,
  radius: number,
  size: Vec3,
): Vec3 {
  switch (shape) {
    case 'disc': {
      const r = radius * Math.sqrt(u1);
      const a = TAU * u2;
      return [r * Math.cos(a), r * Math.sin(a), 0];
    }
    case 'ring': {
      const a = TAU * u1;
      return [radius * Math.cos(a), radius * Math.sin(a), 0];
    }
    case 'sphere-surface':
    case 'sphere-volume': {
      const z = 2 * u1 - 1;
      const a = TAU * u2;
      const s = Math.sqrt(Math.max(0, 1 - z * z));
      const r = shape === 'sphere-volume' ? radius * Math.cbrt(u3) : radius;
      return [r * s * Math.cos(a), r * s * Math.sin(a), r * z];
    }
    case 'box':
      return [(u1 - 0.5) * size[0], (u2 - 0.5) * size[1], (u3 - 0.5) * size[2]];
    case 'line':
      return [(u1 - 0.5) * size[0], 0, 0];
    default:
      return [0, 0, 0];
  }
}

/** World position of particle `index` for generation `step`. */
export function spawnPosition(
  shape: SpawnShape,
  seed: number,
  index: number,
  step: number,
  radius: number,
  size: Vec3,
  center: Vec3,
): Vec3 {
  const p = shapePosition(
    shape,
    unit(seed, index, STREAM.u1, step),
    unit(seed, index, STREAM.u2, step),
    unit(seed, index, STREAM.u3, step),
    radius,
    size,
  );
  return [p[0] + center[0], p[1] + center[1], p[2] + center[2]];
}

/** Initial velocity from the spawn mode: away from the centre, around the Y axis, or random. */
export function spawnVelocity(
  mode: VelocityMode,
  speed: number,
  relative: Vec3,
  seed: number,
  index: number,
  step: number,
): Vec3 {
  if (mode === 'none' || speed === 0) return [0, 0, 0];
  if (mode === 'radial') {
    const length = Math.hypot(relative[0], relative[1], relative[2]) || 1;
    return [
      (relative[0] / length) * speed,
      (relative[1] / length) * speed,
      (relative[2] / length) * speed,
    ];
  }
  if (mode === 'tangential') {
    const length = Math.hypot(relative[0], relative[2]) || 1;
    return [(-relative[2] / length) * speed, 0, (relative[0] / length) * speed];
  }
  const z = 2 * unit(seed, index, STREAM.velA, step) - 1;
  const a = TAU * unit(seed, index, STREAM.velB, step);
  const s = Math.sqrt(Math.max(0, 1 - z * z));
  return [speed * s * Math.cos(a), speed * s * Math.sin(a), speed * z];
}
