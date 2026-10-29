import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** Access to tests/fixtures; must behave exactly like tests/php/Support/Fixtures.php. */
export const ROOT = resolve(__dirname, '../..');

export function fixture(relative: string): unknown {
  return JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures', relative), 'utf8')) as unknown;
}

export function fixtureFiles(directory: string): string[] {
  return readdirSync(resolve(ROOT, 'tests/fixtures', directory)).filter((f) => f.endsWith('.json'));
}

export interface PatchOp {
  op: 'set' | 'remove';
  path: string;
  value?: unknown;
}

function expand(value: unknown): unknown {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).join(',') === 'repeat,times'
  ) {
    const { repeat, times } = value as { repeat: string; times: number };
    return repeat.repeat(times);
  }
  return value;
}

/** Applies set/remove operations at JSON pointers. */
export function patch(document: unknown, ops: readonly PatchOp[]): unknown {
  let root = document;
  for (const op of ops) {
    const value = expand(op.value);
    if (op.path === '') {
      root = value;
      continue;
    }
    const segments = op.path.split('/').slice(1);
    const last = segments.pop() ?? '';
    let target = root as Record<string, unknown> | unknown[];
    for (const segment of segments) {
      target = (Array.isArray(target) ? target[Number(segment)] : target[segment]) as typeof target;
    }
    if (op.op === 'remove') {
      if (Array.isArray(target)) target.splice(Number(last), 1);
      else delete target[last];
    } else if (Array.isArray(target)) {
      target[Number(last)] = value;
    } else {
      target[last] = value;
    }
  }
  return root;
}
