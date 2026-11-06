import { describe, expect, it } from 'vitest';
import descriptor from '../../schemas/effects/particle-field.json';
import { normaliseConfig } from '@editor/config';
import {
  clearAt,
  newEffectContent,
  presetChanges,
  randomSeed,
  resolvedParams,
  materializeList,
  setAt,
} from '@editor/effects/ops';
import {
  branches,
  fieldKind,
  getAt,
  humanize,
  newItem,
  plainNumber,
  propertyEntries,
  stepFor,
  type Json,
} from '@editor/effects/schemaTools';
import {
  effectText,
  enumLabel,
  hasEffectText,
  hasEnumLabel,
} from '@editor/features/effects/labels';
import type { EffectInfo } from '@editor/types/config';
import { validateParams } from '@gpu/core/schema';

const info: EffectInfo = {
  type: descriptor.type,
  label: descriptor.label,
  description: descriptor.description,
  category: descriptor.category,
  continuous: true,
  schemaVersion: 1,
  schema: descriptor.schema,
  presets: descriptor.presets,
  assets: descriptor.assets,
  module: '/m.js',
  builtin: true,
};
const schema = descriptor.schema as unknown as Json;
const prop = (...path: string[]): Json =>
  path.reduce<Json>((node, key) => (node.properties as Record<string, Json>)[key] as Json, schema);

describe('schema tools', () => {
  it('reads values along a path of names and indexes', () => {
    const tree = { a: { b: [{ c: 1 }, { c: 2 }] } };
    expect(getAt(tree, ['a', 'b', 1, 'c'])).toBe(2);
    expect(getAt(tree, ['a', 'x', 'c'])).toBeUndefined();
    expect(getAt(tree, ['a', 'b', 'c'])).toBeUndefined();
    expect(getAt(undefined, [])).toBeUndefined();
  });

  it('formats names, numbers and steps for the controls', () => {
    expect(humanize('spawnShape')).toBe('Spawn shape');
    expect(humanize('color-mode_x')).toBe('Color mode x');
    expect(plainNumber(20000)).toBe('20000');
    expect(plainNumber(0.123456)).toBe('0.1235');
    expect(plainNumber(1.5)).toBe('1.5');
    expect([
      stepFor(0, 1, false),
      stepFor(0, 10, false),
      stepFor(0, 100, false),
      stepFor(0, 100000, false),
      stepFor(1, 100000, true),
    ]).toEqual([0.01, 0.05, 0.1, 1, 1]);
  });

  it('chooses the control for every kind of schema node of the real effect', () => {
    expect(fieldKind(prop('count'))).toBe('integer');
    expect(fieldKind(prop('appearance', 'opacity'))).toBe('number');
    expect(fieldKind(prop('image', 'enabled'))).toBe('boolean');
    expect(fieldKind(prop('spawn', 'shape'))).toBe('enum');
    expect(fieldKind(prop('appearance', 'color'))).toBe('color');
    expect(fieldKind(prop('spawn', 'position'))).toBe('vector');
    expect(fieldKind(prop('appearance', 'palette'))).toBe('colors');
    expect(fieldKind(prop('spawn'))).toBe('object');
    expect(fieldKind(prop('operators'))).toBe('list');
    expect(fieldKind({ type: 'string', maxLength: 5 })).toBe('text');
    expect(fieldKind({ oneOf: [] })).toBe('unknown');
    expect(fieldKind({ type: 'date' })).toBe('unknown');
  });

  it('lists the variants of the forces and builds new items with their defaults', () => {
    const items = prop('operators').items as Json;
    expect(branches(items).map((b) => b.tag)).toEqual([
      'drag',
      'spring-home',
      'vortex',
      'flow-field',
      'gravity-wells',
      'speed-limit',
      'bounds',
    ]);
    expect(branches(items)[0]?.title).toBe('Drag');
    expect(newItem(items, 'drag')).toEqual({ type: 'drag', amount: 0.4 });
    expect(newItem(items, 'gravity-wells')).toEqual({ type: 'gravity-wells', wells: [] });
    expect(newItem(items, 'nope')).toBeNull();
    const wells = (
      ((prop('operators').items as Json).oneOf as Json[])[4]?.properties as Record<string, Json>
    ).wells as Json;
    expect(newItem(wells.items as Json, null)).toEqual({ position: [0, 0, 0], mass: 1 });
    // Scalar entries start with a valid value of their declared type.
    expect(newItem({ type: 'number', minimum: 2, maximum: 9 }, null)).toBe(2);
    expect(newItem({ type: 'number', minimum: -5, maximum: -1 }, null)).toBe(-1);
    expect(newItem({ type: 'number', maximum: 10 }, null)).toBe(0);
    expect(newItem({ type: 'integer', minimum: 0.5, maximum: 9 }, null)).toBe(1);
    expect(newItem({ type: 'number', default: 4 }, null)).toBe(4);
    expect(newItem({ type: 'boolean' }, null)).toBe(false);
    expect(newItem({ type: 'string', enum: ['a', 'b'] }, null)).toBe('a');
    expect(newItem({ type: 'string', format: 'color' }, null)).toBe('#ffffff');
    expect(newItem({ type: 'string', minLength: 2 }, null)).toBe('xx');
    expect(newItem({ type: 'string' }, null)).toBe('');
    expect(branches({})).toEqual([]);
  });

  it('keeps the schema order of properties', () => {
    expect(propertyEntries(schema).map(([key]) => key)).toEqual([
      'count',
      'spawn',
      'lifecycle',
      'operators',
      'appearance',
      'camera',
      'interaction',
      'image',
    ]);
    expect(propertyEntries({})).toEqual([]);
  });
});

describe('effect parameter operations', () => {
  it('copies a list that only exists as a schema default before an item is edited', () => {
    const resolved = { forces: [{ type: 'drag', amount: 1 }], size: 2 };
    expect(materializeList({}, resolved, ['forces', 0, 'amount'])).toEqual({
      forces: [{ type: 'drag', amount: 1 }],
    });
    const edited = setAt(
      materializeList({}, resolved, ['forces', 0, 'amount']),
      ['forces', 0, 'amount'],
      2,
    );
    expect(edited).toEqual({ forces: [{ type: 'drag', amount: 2 }] });
    // Stored lists, plain paths and unknown lists stay untouched.
    const stored = { forces: [{ type: 'drag', amount: 5 }] };
    expect(materializeList(stored, resolved, ['forces', 0, 'amount'])).toBe(stored);
    expect(materializeList({}, resolved, ['size'])).toEqual({});
    expect(materializeList({}, resolved, ['other', 0])).toEqual({});
  });

  it('sets and clears values along a path without touching the input', () => {
    const tree = { spawn: { shape: 'ring' }, list: [1, 2, 3] };
    const frozen = JSON.stringify(tree);
    expect(setAt(tree, ['spawn', 'radius'], 2)).toEqual({
      spawn: { shape: 'ring', radius: 2 },
      list: [1, 2, 3],
    });
    expect(setAt(tree, ['list', 1], 9)).toEqual({ spawn: { shape: 'ring' }, list: [1, 9, 3] });
    expect(setAt(undefined, ['a', 'b'], 1)).toEqual({ a: { b: 1 } });
    expect(setAt(undefined, ['a', 0], 1)).toEqual({ a: [1] });
    expect(setAt(tree, [], 5)).toBe(5);
    expect(clearAt(tree, ['spawn', 'shape'])).toEqual({ list: [1, 2, 3] });
    expect(clearAt(tree, ['list', 0])).toEqual({ spawn: { shape: 'ring' }, list: [2, 3] });
    expect(clearAt(tree, ['list', 0, 'x'])).toEqual({ spawn: { shape: 'ring' }, list: [1, 2, 3] });
    expect(clearAt(tree, ['nothing', 'here'])).toEqual(tree);
    expect(clearAt(tree, [])).toBe(tree);
    expect(clearAt('x', ['a'])).toBe('x');
    expect(clearAt({ a: 1 }, [0])).toEqual({ a: 1 });
    expect(JSON.stringify(tree)).toBe(frozen);
  });

  it('draws positive seeds', () => {
    for (let i = 0; i < 50; i++) {
      const seed = randomSeed();
      expect(Number.isInteger(seed) && seed >= 1 && seed <= 2147483647).toBe(true);
    }
  });

  it('starts new layers from a preset (copied) or empty without presets', () => {
    const content = newEffectContent(info);
    expect(content).toMatchObject({
      effect: 'particle-field',
      preset: 'orbital-mist',
      seed: 7319,
      quality: 'auto',
      fallbackImageId: null,
      alt: '',
      assets: {},
    });
    content.params.count = 1;
    expect(descriptor.presets[0]?.params.count).toBe(20000);
    expect(newEffectContent(info, 'ember-drift').preset).toBe('ember-drift');
    const bare = newEffectContent({ ...info, presets: [] });
    expect(bare.params).toEqual({});
    expect(bare.preset).toBeUndefined();
    expect(bare.seed).toBeGreaterThan(0);
    expect(
      newEffectContent({
        ...info,
        presets: [{ id: 'z', name: 'Z', description: '', seed: 0, params: {} }],
      }).seed,
    ).toBeGreaterThan(0);
  });

  it('turns a preset into parameter, seed and id changes', () => {
    expect(presetChanges(info, 'vortex-ribbons')).toMatchObject({
      seed: 4242,
      preset: 'vortex-ribbons',
    });
    expect(presetChanges(info, 'missing')).toBeNull();
  });

  it('resolves the parameters an effect actually runs with, and every preset stays valid', () => {
    const resolved = resolvedParams(info, { count: 5 });
    expect(resolved.count).toBe(5);
    expect(resolved).toHaveProperty('camera.projection', 'perspective');
    expect(validateParams(descriptor.schema, resolved)).toEqual([]);
    for (const preset of descriptor.presets)
      expect(
        validateParams(descriptor.schema, resolvedParams(info, preset.params)),
        preset.id,
      ).toEqual([]);
  });
});

describe('editor config and labels', () => {
  const raw = {
    restRoot: 'http://x/wp-json/sw-sliderman/v1',
    coreRestRoot: 'http://x/wp-json/wp/v2',
    effects: [
      {
        type: 'particle-field',
        label: 'Particles',
        module: '/m.js',
        schema: { type: 'object', properties: {} },
        continuous: false,
        schemaVersion: 2,
        builtin: true,
        presets: [
          { id: 'a', name: 'A', params: {}, seed: 5 },
          { id: 3 },
          'x',
          { id: 'b', params: { x: 1 } },
        ],
        assets: [{ key: 'image', label: 'Pic' }, { key: 'k' }, { nokey: true }],
      },
      { type: 'bad', module: 5, schema: {} },
      { type: 'noschema', module: '/m.js', schema: [] },
      'junk',
    ],
  };

  it('normalises the effect catalog defensively', () => {
    const config = normaliseConfig(raw);
    expect(config.coreRestRoot).toBe('http://x/wp-json/wp/v2/');
    expect(config.effects).toHaveLength(1);
    const effect = config.effects[0];
    expect(effect).toMatchObject({
      type: 'particle-field',
      label: 'Particles',
      continuous: false,
      schemaVersion: 2,
      builtin: true,
      description: '',
      category: '',
    });
    expect(effect?.presets).toEqual(
      [
        { id: 'a', name: 'A', description: '', seed: 5, params: {} },
        { id: 'b', name: 'b', description: '', seed: 0, params: { x: 1 } },
      ].filter((p) => p.id === 'a' || p.id === 'b'),
    );
    expect(effect?.assets).toEqual([
      { key: 'image', label: 'Pic' },
      { key: 'k', label: 'k' },
    ]);
    expect(normaliseConfig({ restRoot: 'http://x/', effects: 'no' }).effects).toEqual([]);
  });

  it('translates known effect texts and leaves unknown ones as they are', () => {
    expect(effectText('Spawn')).toBe('Spawn');
    expect(effectText('Some add-on title')).toBe('Some add-on title');
    expect(enumLabel('sphere-volume')).toBe('Sphere volume');
    expect(enumLabel('a-new_value')).toBe('A new value');
  });

  it('has a translatable text for every title, description, preset, slot and enum value of the built-in schema', () => {
    const missing = new Set<string>();
    const need = (text: unknown): void => {
      if (typeof text === 'string' && text !== '' && !hasEffectText(text)) missing.add(text);
    };
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== 'object' || node === null) return;
      const n = node as Record<string, unknown>;
      need(n.title);
      need(n.description);
      if (Array.isArray(n.enum))
        for (const value of n.enum)
          if (!hasEnumLabel(String(value))) missing.add(`enum:${String(value)}`);
      Object.values(n).forEach(walk);
    };
    walk(descriptor.schema);
    for (const preset of descriptor.presets) {
      need(preset.name);
      need(preset.description);
    }
    for (const slot of descriptor.assets) need(slot.label);
    need(descriptor.label);
    need(descriptor.description);
    expect([...missing]).toEqual([]);
  });
});
