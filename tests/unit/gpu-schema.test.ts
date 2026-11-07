import { describe, expect, it } from 'vitest';
import {
  checkSchema,
  escapePointer,
  validateParams,
  withDefaults,
  type SchemaIssue,
} from '@gpu/core';
import { fixture } from './fixtures';

interface ValueCase {
  name: string;
  schema: string;
  value: unknown;
  issues: SchemaIssue[];
}
interface BadSchema {
  name: string;
  schema: unknown;
  paths: string[];
}
const suite = fixture('effects/schema.json') as {
  schemas: Record<string, unknown>;
  cases: ValueCase[];
  badSchemas: BadSchema[];
};

/** `{"repeat": s, "times": n}` expands to a repeated string (same helper in EffectSchemaTest.php). */
function expand(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(expand);
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if ('repeat' in record && 'times' in record)
      return String(record.repeat).repeat(Number(record.times));
    return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, expand(entry)]));
  }
  return value;
}
const keys = (issues: readonly SchemaIssue[]) => issues.map((i) => `${i.path} ${i.code}`).sort();

describe('effect parameter schema (shared PHP/TS contract)', () => {
  it('the shared schema is itself valid', () => {
    expect(checkSchema(suite.schemas.particle)).toEqual([]);
  });

  it.each(suite.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(keys(validateParams(suite.schemas[c.schema], expand(c.value)))).toEqual(keys(c.issues));
  });

  it.each(suite.badSchemas.map((c) => [c.name, c] as const))('schema check: %s', (_name, c) => {
    expect(keys(checkSchema(c.schema))).toEqual(c.paths.map((path) => `${path} schema`).sort());
  });

  it('rejects non-finite numbers and escapes pointer segments', () => {
    const schema = { type: 'number', minimum: 0, maximum: 5 };
    expect(validateParams(schema, Number.NaN)).toEqual([{ path: '', code: 'type' }]);
    expect(validateParams(schema, Number.POSITIVE_INFINITY)).toEqual([{ path: '', code: 'type' }]);
    expect(escapePointer('a/b~c')).toBe('a~1b~0c');
  });

  it('checks boolean const and numeric enums regardless of JSON notation', () => {
    expect(validateParams({ type: 'boolean', const: true }, false)).toEqual([
      { path: '', code: 'enum' },
    ]);
    expect(validateParams({ type: 'number', minimum: 0, maximum: 5, enum: [1, 2] }, 3)).toEqual([
      { path: '', code: 'enum' },
    ]);
  });
});

describe('withDefaults', () => {
  const schema = suite.schemas.particle;

  it('fills omitted optional values, including nested ones and operator branches', () => {
    const result = withDefaults(schema, {
      count: 5,
      spawn: { shape: 'ring' },
      operators: [{ type: 'drag' }],
    }) as Record<string, unknown>;
    expect(result.name).toBe('Nebel');
    expect(result.enabled).toBe(true);
    expect(result.spawn).toEqual({ shape: 'ring', radius: 1.2, position: [0, 0, 0] });
    expect(result.operators).toEqual([{ type: 'drag', amount: 0.1 }]);
    expect(validateParams(schema, result)).toEqual([]);
  });

  it('keeps given values, never mutates its input and clones defaults', () => {
    const input = { count: 7, spawn: { shape: 'disc', radius: 3 } };
    const frozen = JSON.stringify(input);
    const a = withDefaults(schema, input) as { spawn: { position: number[] } };
    const b = withDefaults(schema, input) as { spawn: { position: number[] } };
    expect(JSON.stringify(input)).toBe(frozen);
    expect(a.spawn.position).not.toBe(b.spawn.position);
    expect((a as unknown as { count: number }).count).toBe(7);
  });

  it('leaves unknown values and unknown operator types untouched for validation to report', () => {
    const result = withDefaults(schema, {
      count: 1,
      spawn: { shape: 'x' },
      extra: 1,
      operators: [{ type: 'magic' }],
    }) as Record<string, unknown>;
    expect(result.extra).toBe(1);
    expect(result.operators).toEqual([{ type: 'magic' }]);
  });

  it('creates optional object groups that have member defaults, but not empty ones', () => {
    const result = withDefaults(schema, { count: 5, spawn: { shape: 'ring' } }) as Record<
      string,
      unknown
    >;
    expect(result.appearance).toEqual({ color: '#78b9ff', blend: 'additive' });
    const bare = {
      type: 'object',
      properties: {
        group: { type: 'object', properties: { n: { type: 'number', minimum: 0, maximum: 1 } } },
      },
    };
    expect(withDefaults(bare, {})).toEqual({});
  });

  it('tolerates a non-object schema', () => {
    expect(withDefaults(null, { a: 1 })).toEqual({ a: 1 });
  });
});
