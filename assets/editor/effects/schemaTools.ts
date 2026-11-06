import { withDefaults } from '@gpu/core/schema';

/** Helpers for the schema-generated effect form (pure, unit-tested). */
export type Json = Record<string, unknown>;
export type Path = ReadonlyArray<string | number>;

export const isJson = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function getAt(tree: unknown, path: Path): unknown {
  let node: unknown = tree;
  for (const key of path) {
    if (typeof key === 'number') node = Array.isArray(node) ? node[key] : undefined;
    else node = isJson(node) ? node[key] : undefined;
  }
  return node;
}

/** `spawnShape` → `Spawn shape`, for properties without a schema title. */
export function humanize(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Number as plain text for editable fields: no thousands separators, no rounding to one decimal. */
export function plainNumber(value: number): string {
  return String(Math.round(value * 10000) / 10000);
}

/** Slider step for a numeric range: fine enough to be smooth, coarse enough to be usable. */
export function stepFor(min: number, max: number, integer: boolean): number {
  if (integer) return 1;
  const range = max - min;
  if (range <= 2) return 0.01;
  if (range <= 20) return 0.05;
  if (range <= 200) return 0.1;
  return 1;
}

export type FieldKind =
  | 'integer'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'color'
  | 'text'
  | 'vector'
  | 'colors'
  | 'object'
  | 'list'
  | 'unknown';

/** Which control renders a schema node. */
export function fieldKind(schema: Json): FieldKind {
  if (Array.isArray(schema.oneOf)) return 'unknown'; // only reachable as a list item
  // An enum restricts the value whatever its scalar type (numbers keep their type in the options).
  if (Array.isArray(schema.enum) && schema.type !== 'object' && schema.type !== 'array')
    return 'enum';
  switch (schema.type) {
    case 'integer':
      return 'integer';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'string':
      return schema.format === 'color' ? 'color' : 'text';
    case 'object':
      return 'object';
    case 'array': {
      const items = isJson(schema.items) ? schema.items : {};
      if (items.type === 'number' && schema.minItems === schema.maxItems && schema.maxItems === 3)
        return 'vector';
      if (items.type === 'string' && items.format === 'color') return 'colors';
      return 'list';
    }
    default:
      return 'unknown';
  }
}

export interface Branch {
  readonly tag: string;
  readonly title: string;
  readonly schema: Json;
}

/** The variants of a discriminated list item (e.g. operator types). */
export function branches(items: Json): Branch[] {
  if (!Array.isArray(items.oneOf)) return [];
  const discriminator = typeof items.discriminator === 'string' ? items.discriminator : 'type';
  return items.oneOf.filter(isJson).map((schema) => {
    const tagSchema = isJson(schema.properties) ? schema.properties[discriminator] : undefined;
    const tag = isJson(tagSchema) && typeof tagSchema.const === 'string' ? tagSchema.const : '';
    return { tag, title: typeof schema.title === 'string' ? schema.title : humanize(tag), schema };
  });
}

/** A new list item of the given variant, with its schema defaults. */
export function newItem(items: Json, tag: string | null): unknown {
  const discriminator = typeof items.discriminator === 'string' ? items.discriminator : 'type';
  if (Array.isArray(items.oneOf)) {
    const branch = branches(items).find((b) => b.tag === tag);
    return branch ? withDefaults(branch.schema, { [discriminator]: tag }) : null;
  }
  return withDefaults(items, items.default ?? initialValue(items));
}

/** A valid starting value for a list entry of the declared type (objects start empty and get defaults). */
function initialValue(schema: Json): unknown {
  switch (schema.type) {
    case 'integer':
    case 'number': {
      const min = typeof schema.minimum === 'number' ? schema.minimum : undefined;
      const max = typeof schema.maximum === 'number' ? schema.maximum : undefined;
      const start = Math.min(Math.max(0, min ?? 0), max ?? Number.MAX_SAFE_INTEGER);
      return schema.type === 'integer' ? Math.ceil(start) : start;
    }
    case 'boolean':
      return false;
    case 'string':
      if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
      if (schema.format === 'color') return '#ffffff';
      return 'x'.repeat(typeof schema.minLength === 'number' ? schema.minLength : 0);
    default:
      return {};
  }
}

/** Order of the properties of an object schema, scalars first inside a group is not imposed: schema order wins. */
export function propertyEntries(schema: Json): Array<[string, Json]> {
  const properties = isJson(schema.properties) ? schema.properties : {};
  return Object.entries(properties).filter((entry): entry is [string, Json] => isJson(entry[1]));
}
