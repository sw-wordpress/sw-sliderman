import type { SchemaIssue } from './schema';

/** The configuration violates the module's parameter schema or version. */
export class EffectConfigError extends Error {
  constructor(
    readonly type: string,
    readonly issues: readonly {
      readonly path: string;
      readonly code: SchemaIssue['code'] | 'schema_version';
    }[],
  ) {
    super(
      `Invalid configuration for effect "${type}": ${issues.map((i) => `${i.path} ${i.code}`).join(', ')}`,
    );
    this.name = 'EffectConfigError';
  }
}

/** The effect type is unknown or its module could not be loaded; the static fallback applies. */
export class EffectUnavailableError extends Error {
  constructor(
    readonly type: string,
    readonly reason: 'unknown' | 'load_failed' | 'invalid_module',
    cause?: unknown,
  ) {
    super(
      `Effect "${type}" is unavailable (${reason}).`,
      cause === undefined ? undefined : { cause },
    );
    this.name = 'EffectUnavailableError';
  }
}
