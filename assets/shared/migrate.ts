import { SCHEMA_VERSION } from './types';

type Tree = Record<string, unknown>;
export type MigrationStep = (source: Tree) => Tree;

/** Explicit one-version steps on a private copy. Unknown formats are never guessed. */
export function migrateDocument(
  source: unknown,
  steps: Readonly<Record<number, MigrationStep>> = {},
  targetVersion: number = SCHEMA_VERSION,
): Tree {
  const tree: unknown = JSON.parse(JSON.stringify(source));
  if (typeof tree !== 'object' || tree === null || Array.isArray(tree))
    throw new Error('Unsupported schema version');
  let result = tree as Tree;
  if (
    !Number.isInteger(result.schemaVersion) ||
    typeof result.schemaVersion !== 'number' ||
    result.schemaVersion < 1 ||
    result.schemaVersion > targetVersion
  ) {
    throw new Error('Unsupported schema version');
  }
  let version = result.schemaVersion;
  while (version < targetVersion) {
    const step = steps[version];
    if (!step) throw new Error('Missing migration step');
    const id = result.id;
    result = step(result);
    if (result.schemaVersion !== version + 1 || result.id !== id)
      throw new Error('Invalid migration step');
    version++;
  }
  return result;
}
