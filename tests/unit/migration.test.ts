import { describe, expect, it } from 'vitest';
import { migrateDocument } from '@shared/migrate';
import { fixture } from './fixtures';

const data = fixture('migrations/dispatcher.json') as {
  source: Record<string, unknown>;
  targetVersion: number;
  expected: unknown;
  rejectedVersions: unknown[];
};
describe('schema migration dispatcher', () => {
  const steps = {
    1: (source: Record<string, unknown>) => ({ ...source, schemaVersion: 2 }),
    2: (source: Record<string, unknown>) => ({ ...source, schemaVersion: 3, label: 'migrated' }),
  };
  it('runs one-version steps and preserves the source backup', () => {
    const before = JSON.stringify(data.source);
    expect(migrateDocument(data.source, steps, data.targetVersion)).toEqual(data.expected);
    expect(JSON.stringify(data.source)).toBe(before);
  });
  it.each(data.rejectedVersions)('rejects unsupported source version %s', (version) => {
    expect(() =>
      migrateDocument({ ...data.source, schemaVersion: version }, steps, data.targetVersion),
    ).toThrow();
  });
  it('rejects gaps and identity changes', () => {
    expect(() => migrateDocument(data.source, {}, 3)).toThrow();
    expect(() =>
      migrateDocument(data.source, { 1: (s) => ({ ...s, schemaVersion: 3 }) }, 3),
    ).toThrow();
    expect(() =>
      migrateDocument(data.source, { 1: (s) => ({ ...s, schemaVersion: 2, id: 'changed' }) }, 2),
    ).toThrow();
  });
  it('leaves the production v1 format unchanged and rejects future formats', () => {
    expect(migrateDocument(data.source)).toEqual(data.source);
    expect(() => migrateDocument({ ...data.source, schemaVersion: 2 })).toThrow();
  });
});
