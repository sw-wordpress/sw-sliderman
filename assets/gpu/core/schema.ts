/**
 * Parameter schema dialect of effect modules (ADR 0005): a closed subset of JSON Schema that is
 * implemented twice, here and in src/Domain/EffectSchema.php, against tests/fixtures/effects/schema.json.
 * The same schema drives the editor panel.
 *
 * Rules that keep parameters bounded (GPU abuse protection): objects are closed (unknown keys are
 * rejected), numbers need `minimum` and `maximum`, strings need `maxLength`, arrays need `maxItems`.
 */

export type SchemaIssueCode =
  | 'type'
  | 'required'
  | 'unknown_key'
  | 'range'
  | 'length'
  | 'count'
  | 'enum'
  | 'pattern'
  | 'schema';

/** Codes reported for a value; `schema` only occurs when a schema itself is checked. */
export type ValueIssueCode = Exclude<SchemaIssueCode, 'schema'>;

export interface SchemaIssue {
  /** JSON pointer (RFC 6901) of the offending value, or of the offending schema node for `schema`. */
  readonly path: string;
  readonly code: SchemaIssueCode;
}

export interface ValueIssue extends SchemaIssue {
  readonly code: ValueIssueCode;
}

type Json = Record<string, unknown>;

export const COLOR_FORMAT = /^#[0-9a-fA-F]{6}$/;
export const ID_FORMAT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

const TYPES = ['object', 'array', 'string', 'number', 'integer', 'boolean'] as const;
const KEYWORDS = new Set([
  'type',
  'properties',
  'required',
  'items',
  'minItems',
  'maxItems',
  'enum',
  'const',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'format',
  'oneOf',
  'discriminator',
  'default',
  'title',
  'description',
]);
const MAX_SCHEMA_DEPTH = 8;
const MAX_ENUM = 64;
const MAX_ONE_OF = 32;
const MAX_PROPERTIES = 64;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isScalar = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value));
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

export const escapePointer = (segment: string): string =>
  segment.replace(/~/g, '~0').replace(/\//g, '~1');

/** Length in code points (PHP: mb_strlen), not UTF-16 units. */
const codePoints = (value: string): number => {
  let count = 0;
  for (const _ of value) count++;
  return count;
};

function same(a: unknown, b: unknown): boolean {
  return a === b;
}

// ---------------------------------------------------------------------------------------------
// Schema check
// ---------------------------------------------------------------------------------------------

/** Structural check of a schema; an empty result means the schema is usable and bounded. */
export function checkSchema(schema: unknown): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  checkNode(schema, '', 0, issues);
  if (issues.length === 0) {
    // A default must itself be valid; this catches typos in presets and the editor's reset values.
    collectDefaults(schema as Json, '', issues);
  }
  return issues;
}

function bad(issues: SchemaIssue[], path: string): void {
  issues.push({ path, code: 'schema' });
}

function checkNode(node: unknown, path: string, depth: number, issues: SchemaIssue[]): void {
  if (!isObject(node) || depth > MAX_SCHEMA_DEPTH) return bad(issues, path);
  for (const key of Object.keys(node)) {
    if (!KEYWORDS.has(key) && !key.startsWith('x-')) bad(issues, `${path}/${escapePointer(key)}`);
  }
  if ('oneOf' in node) return checkOneOf(node, path, depth, issues);
  const type = node.type;
  if (typeof type !== 'string' || !(TYPES as readonly string[]).includes(type))
    return bad(issues, `${path}/type`);
  if ('discriminator' in node) bad(issues, `${path}/discriminator`);

  const onlyFor = (keys: string[], allowed: boolean): void => {
    for (const key of keys) if (key in node && !allowed) bad(issues, `${path}/${key}`);
  };
  onlyFor(['properties', 'required'], type === 'object');
  onlyFor(['items', 'minItems', 'maxItems'], type === 'array');
  onlyFor(['minLength', 'maxLength', 'format'], type === 'string');
  onlyFor(['minimum', 'maximum'], type === 'number' || type === 'integer');

  if (type === 'object') checkObject(node, path, depth, issues);
  if (type === 'array') {
    if (!('items' in node)) bad(issues, `${path}/items`);
    else checkNode(node.items, `${path}/items`, depth + 1, issues);
    if (!isCount(node.maxItems)) bad(issues, `${path}/maxItems`);
    if (
      'minItems' in node &&
      (!isCount(node.minItems) || (isCount(node.maxItems) && node.minItems > node.maxItems))
    ) {
      bad(issues, `${path}/minItems`);
    }
  }
  if (type === 'string') {
    if (!isCount(node.maxLength)) bad(issues, `${path}/maxLength`);
    if (
      'minLength' in node &&
      (!isCount(node.minLength) || (isCount(node.maxLength) && node.minLength > node.maxLength))
    ) {
      bad(issues, `${path}/minLength`);
    }
    if ('format' in node && node.format !== 'color' && node.format !== 'id')
      bad(issues, `${path}/format`);
  }
  if (type === 'number' || type === 'integer') {
    const { minimum, maximum } = node;
    if (typeof minimum !== 'number' || !Number.isFinite(minimum)) bad(issues, `${path}/minimum`);
    if (typeof maximum !== 'number' || !Number.isFinite(maximum)) bad(issues, `${path}/maximum`);
    if (typeof minimum === 'number' && typeof maximum === 'number' && minimum > maximum)
      bad(issues, `${path}/minimum`);
  }
  if ('enum' in node) {
    const values = node.enum;
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      values.length > MAX_ENUM ||
      !values.every(isScalar)
    ) {
      bad(issues, `${path}/enum`);
    }
  }
  if ('const' in node && !isScalar(node.const)) bad(issues, `${path}/const`);
}

function checkObject(node: Json, path: string, depth: number, issues: SchemaIssue[]): void {
  const properties = node.properties;
  if (!isObject(properties) || Object.keys(properties).length > MAX_PROPERTIES) {
    return bad(issues, `${path}/properties`);
  }
  for (const [key, child] of Object.entries(properties)) {
    checkNode(child, `${path}/properties/${escapePointer(key)}`, depth + 1, issues);
  }
  if ('required' in node) {
    const required = node.required;
    if (
      !Array.isArray(required) ||
      !required.every((key) => typeof key === 'string' && key in properties)
    ) {
      bad(issues, `${path}/required`);
    }
  }
}

function checkOneOf(node: Json, path: string, depth: number, issues: SchemaIssue[]): void {
  for (const key of Object.keys(node)) {
    if (
      !['oneOf', 'discriminator', 'default', 'title', 'description'].includes(key) &&
      !key.startsWith('x-')
    ) {
      bad(issues, `${path}/${escapePointer(key)}`);
    }
  }
  const branches = node.oneOf;
  const discriminator = node.discriminator;
  if (typeof discriminator !== 'string' || discriminator === '')
    bad(issues, `${path}/discriminator`);
  if (!Array.isArray(branches) || branches.length === 0 || branches.length > MAX_ONE_OF) {
    return bad(issues, `${path}/oneOf`);
  }
  const seen = new Set<unknown>();
  branches.forEach((branch, index) => {
    const at = `${path}/oneOf/${index}`;
    checkNode(branch, at, depth + 1, issues);
    // Without a valid discriminator the tag checks would only repeat the same root cause.
    if (typeof discriminator !== 'string' || discriminator === '') return;
    if (!isObject(branch) || branch.type !== 'object' || !isObject(branch.properties)) return;
    const tag = branch.properties[discriminator];
    const value = isObject(tag) ? tag.const : undefined;
    const required = Array.isArray(branch.required) ? branch.required : [];
    if (typeof value !== 'string' || seen.has(value) || !required.includes(discriminator))
      bad(issues, `${at}/properties`);
    seen.add(value);
  });
}

function collectDefaults(node: Json, path: string, issues: SchemaIssue[]): void {
  if ('default' in node && validateParams(stripDefault(node), node.default).length > 0)
    bad(issues, `${path}/default`);
  const children: Array<[string, unknown]> = [];
  if (isObject(node.properties)) {
    for (const [key, child] of Object.entries(node.properties))
      children.push([`${path}/properties/${escapePointer(key)}`, child]);
  }
  if (isObject(node.items)) children.push([`${path}/items`, node.items]);
  if (Array.isArray(node.oneOf))
    node.oneOf.forEach((child, i) => children.push([`${path}/oneOf/${i}`, child]));
  for (const [at, child] of children) if (isObject(child)) collectDefaults(child, at, issues);
}

const stripDefault = (node: Json): Json => {
  const { default: _unused, ...rest } = node;
  return rest;
};

// ---------------------------------------------------------------------------------------------
// Value validation
// ---------------------------------------------------------------------------------------------

/**
 * Validates a value against a checked schema. A wrongly typed value is reported once and not
 * inspected further; unknown keys are reported individually (same behaviour as the PHP copy).
 */
export function validateParams(schema: unknown, value: unknown): ValueIssue[] {
  const issues: ValueIssue[] = [];
  if (isObject(schema)) validateNode(schema, value, '', issues);
  return issues;
}

function validateNode(node: Json, value: unknown, path: string, issues: ValueIssue[]): void {
  if (Array.isArray(node.oneOf)) return validateOneOf(node, value, path, issues);
  switch (node.type) {
    case 'object':
      return validateObject(node, value, path, issues);
    case 'array':
      return validateArray(node, value, path, issues);
    case 'string':
      return validateString(node, value, path, issues);
    case 'number':
    case 'integer':
      return validateNumber(node, value, path, issues);
    case 'boolean':
      if (typeof value !== 'boolean') issues.push({ path, code: 'type' });
      else checkEnum(node, value, path, issues);
      return;
  }
}

function checkEnum(node: Json, value: unknown, path: string, issues: ValueIssue[]): void {
  if (Array.isArray(node.enum) && !node.enum.some((entry) => same(entry, value)))
    issues.push({ path, code: 'enum' });
  else if ('const' in node && !same(node.const, value)) issues.push({ path, code: 'enum' });
}

function validateObject(node: Json, value: unknown, path: string, issues: ValueIssue[]): void {
  if (!isObject(value)) return void issues.push({ path, code: 'type' });
  const properties = (node.properties ?? {}) as Json;
  for (const key of Object.keys(value)) {
    if (!(key in properties))
      issues.push({ path: `${path}/${escapePointer(key)}`, code: 'unknown_key' });
  }
  const required = Array.isArray(node.required) ? (node.required as string[]) : [];
  for (const key of required) {
    if (!(key in value)) issues.push({ path: `${path}/${escapePointer(key)}`, code: 'required' });
  }
  for (const [key, child] of Object.entries(properties)) {
    if (key in value && isObject(child))
      validateNode(child, value[key], `${path}/${escapePointer(key)}`, issues);
  }
}

function validateOneOf(node: Json, value: unknown, path: string, issues: ValueIssue[]): void {
  if (!isObject(value)) return void issues.push({ path, code: 'type' });
  const discriminator = node.discriminator as string;
  const at = `${path}/${escapePointer(discriminator)}`;
  if (!(discriminator in value)) return void issues.push({ path: at, code: 'required' });
  const tag = value[discriminator];
  const branch = (node.oneOf as Json[]).find((candidate) =>
    same(((candidate.properties as Json)[discriminator] as Json).const, tag),
  );
  if (!branch) return void issues.push({ path: at, code: 'enum' });
  validateObject(branch, value, path, issues);
}

function validateArray(node: Json, value: unknown, path: string, issues: ValueIssue[]): void {
  if (!Array.isArray(value)) return void issues.push({ path, code: 'type' });
  const min = typeof node.minItems === 'number' ? node.minItems : 0;
  if (value.length < min || value.length > (node.maxItems as number))
    issues.push({ path, code: 'count' });
  const items = node.items as Json;
  value.forEach((item, index) => validateNode(items, item, `${path}/${index}`, issues));
}

function validateString(node: Json, value: unknown, path: string, issues: ValueIssue[]): void {
  if (typeof value !== 'string') return void issues.push({ path, code: 'type' });
  const length = codePoints(value);
  const min = typeof node.minLength === 'number' ? node.minLength : 0;
  if (length < min || length > (node.maxLength as number)) issues.push({ path, code: 'length' });
  if (node.format === 'color' && !COLOR_FORMAT.test(value)) issues.push({ path, code: 'pattern' });
  if (node.format === 'id' && !ID_FORMAT.test(value)) issues.push({ path, code: 'pattern' });
  checkEnum(node, value, path, issues);
}

function validateNumber(node: Json, value: unknown, path: string, issues: ValueIssue[]): void {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (node.type === 'integer' && !Number.isInteger(value))
  ) {
    return void issues.push({ path, code: 'type' });
  }
  if (value < (node.minimum as number) || value > (node.maximum as number))
    issues.push({ path, code: 'range' });
  checkEnum(node, value, path, issues);
}

// ---------------------------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------------------------

const clone = <T>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);

/**
 * Fills omitted optional values from the schema's `default`s, including optional object groups whose
 * members have defaults (stored parameters may be partial;
 * presets only override declared values). Returns a new value; the input is never modified.
 */
export function withDefaults(schema: unknown, value: unknown): unknown {
  if (!isObject(schema)) return clone(value);
  if (Array.isArray(schema.oneOf) && isObject(value)) {
    const discriminator = schema.discriminator as string;
    const branch = (schema.oneOf as Json[]).find((candidate) =>
      same(((candidate.properties as Json)[discriminator] as Json).const, value[discriminator]),
    );
    return branch ? withDefaults(branch, value) : clone(value);
  }
  if (schema.type === 'object' && isObject(value)) {
    const out: Json = {};
    const properties = (schema.properties ?? {}) as Json;
    for (const [key, entry] of Object.entries(value))
      out[key] = key in properties ? withDefaults(properties[key], entry) : clone(entry);
    for (const [key, child] of Object.entries(properties)) {
      if (key in out || !isObject(child)) continue;
      if ('default' in child) out[key] = withDefaults(child, child.default);
      else if (child.type === 'object') {
        // An optional group whose members have defaults exists with those defaults.
        const filled = withDefaults(child, {}) as Json;
        if (Object.keys(filled).length > 0) out[key] = filled;
      }
    }
    return out;
  }
  if (schema.type === 'array' && Array.isArray(value))
    return value.map((item) => withDefaults(schema.items, item));
  return clone(value);
}
