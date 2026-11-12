/**
 * Deterministic pseudo-randomness. `hash32` is the PCG output hash (integer only), so the same
 * function can be written in GLSL/WGSL: shaders derive every per-particle random number from
 * `(seed, index, stream)` instead of stateful generators, which keeps CPU reference tests and the
 * GPU in agreement. Never use `Math.random()` or clocks in effect logic.
 */

/** PCG output hash of a 32-bit unsigned integer. */
export function hash32(value: number): number {
  const state = (Math.imul(value >>> 0, 747796405) + 2891336453) >>> 0;
  const shift = ((state >>> 28) + 4) >>> 0;
  const word = Math.imul(((state >>> shift) ^ state) >>> 0, 277803737) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
}

/** Hash of a particle: `seed`, element `index` and an independent `stream` (use one per quantity). */
export function hashAt(seed: number, index: number, stream = 0): number {
  return hash32((hash32((seed >>> 0) ^ Math.imul(stream >>> 0, 2654435761)) + (index >>> 0)) >>> 0);
}

/** Maps a hash to [0, 1) using its top 24 bits (exactly representable as float32). */
export function toUnit(hash: number): number {
  return (hash >>> 8) / 16777216;
}

/** Uniform number in [0, 1) for `(seed, index, stream)`. */
export function unitAt(seed: number, index: number, stream = 0): number {
  return toUnit(hashAt(seed, index, stream));
}

/** Stateful generator for CPU-side sequences (sampling order, tests); mulberry32. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
