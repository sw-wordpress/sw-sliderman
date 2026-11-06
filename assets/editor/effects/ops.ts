import { withDefaults } from '@gpu/core/schema';
import type { EffectContent } from '@shared/types';
import type { EffectInfo } from '@editor/types/config';

/** Random seed for a new effect (1 … 2³¹−1); the editor offers "new random seed" as an action. */
export function randomSeed(): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return ((values[0] ?? 1) % 2147483646) + 1;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Content of a new effect layer, starting from the first preset when the effect has one. */
export function newEffectContent(info: EffectInfo, presetId?: string): EffectContent {
  const preset = info.presets.find((p) => p.id === presetId) ?? info.presets[0];
  return {
    effect: info.type,
    schemaVersion: info.schemaVersion,
    seed: preset && preset.seed > 0 ? preset.seed : randomSeed(),
    quality: 'auto',
    params: preset ? clone(preset.params) : {},
    ...(preset ? { preset: preset.id } : {}),
    alt: '',
    fallbackImageId: null,
    assets: {},
  };
}

/** Replaces parameters and seed by a preset's; media and fallback image stay. */
export function presetChanges(
  info: EffectInfo,
  presetId: string,
): Pick<EffectContent, 'params' | 'seed' | 'preset'> | null {
  const preset = info.presets.find((p) => p.id === presetId);
  if (!preset) return null;
  return {
    params: clone(preset.params),
    seed: preset.seed > 0 ? preset.seed : randomSeed(),
    preset: preset.id,
  };
}

/** All parameters with defaults filled in: what the effect actually runs with. */
export function resolvedParams(
  info: EffectInfo,
  params: Record<string, unknown>,
): Record<string, unknown> {
  return withDefaults(info.schema, params) as Record<string, unknown>;
}

/** Sets `path` (property names and array indexes) to `value`, creating objects on the way; returns a new tree. */
export function setAt(
  tree: unknown,
  path: ReadonlyArray<string | number>,
  value: unknown,
): unknown {
  const [head, ...rest] = path;
  if (head === undefined) return clone(value);
  if (typeof head === 'number') {
    const list = Array.isArray(tree) ? [...tree] : [];
    list[head] = setAt(list[head], rest, value);
    return list;
  }
  const object =
    typeof tree === 'object' && tree !== null && !Array.isArray(tree)
      ? { ...(tree as Record<string, unknown>) }
      : {};
  object[head] = setAt(object[head], rest, value);
  return object;
}

/** Removes the value at `path` (back to the default); empty parent objects disappear too. */
export function clearAt(tree: unknown, path: ReadonlyArray<string | number>): unknown {
  const [head, ...rest] = path;
  if (head === undefined) return tree;
  if (typeof head === 'number') {
    if (!Array.isArray(tree)) return tree;
    const list = [...tree];
    if (rest.length === 0) list.splice(head, 1);
    else list[head] = clearAt(list[head], rest);
    return list;
  }
  if (typeof tree !== 'object' || tree === null || Array.isArray(tree)) return tree;
  const object = { ...(tree as Record<string, unknown>) };
  if (rest.length === 0) delete object[head];
  else {
    const child = clearAt(object[head], rest);
    if (
      typeof child === 'object' &&
      child !== null &&
      !Array.isArray(child) &&
      Object.keys(child).length === 0
    )
      delete object[head];
    else object[head] = child;
  }
  return object;
}
