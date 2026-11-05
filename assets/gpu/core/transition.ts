/**
 * Parameter transitions (TODO G1, spec 2.8): numbers, vectors and colours are interpolated;
 * discrete values (enums, booleans, strings) switch at 50 %; keys present on one side only appear or
 * disappear at 50 %. `t = 0` yields `from`, `t = 1` exactly `to`.
 */

export type EasingName = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export function ease(name: EasingName, t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  switch (name) {
    case 'ease-in':
      return x * x;
    case 'ease-out':
      return 1 - (1 - x) * (1 - x);
    case 'ease-in-out':
      return x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x);
    default:
      return x;
  }
}

const COLOR = /^#[0-9a-fA-F]{6}$/;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function mixColor(a: string, b: string, t: number): string {
  const channel = (hex: string, at: number): number => parseInt(hex.slice(at, at + 2), 16);
  let out = '#';
  for (const at of [1, 3, 5]) {
    const value = Math.round(channel(a, at) + (channel(b, at) - channel(a, at)) * t);
    out += value.toString(16).padStart(2, '0');
  }
  return out;
}

const clone = <T>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);

export function blend(from: unknown, to: unknown, t: number): unknown {
  const x = Math.min(Math.max(t, 0), 1);
  if (x <= 0) return clone(from);
  if (x >= 1) return clone(to);
  if (typeof from === 'number' && typeof to === 'number') return from + (to - from) * x;
  if (typeof from === 'string' && typeof to === 'string' && COLOR.test(from) && COLOR.test(to))
    return mixColor(from, to, x);
  if (Array.isArray(from) && Array.isArray(to) && from.length === to.length) {
    return from.map((entry, i) => blend(entry, to[i], x));
  }
  if (isObject(from) && isObject(to)) {
    const out: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
      if (key in from && key in to) out[key] = blend(from[key], to[key], x);
      else if (key in from && x < 0.5) out[key] = clone(from[key]);
      else if (key in to && x >= 0.5) out[key] = clone(to[key]);
    }
    return out;
  }
  return x < 0.5 ? clone(from) : clone(to);
}
