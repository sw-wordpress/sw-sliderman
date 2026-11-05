#!/usr/bin/env node
/**
 * Copies the build-free block files (assets/block) to build/block, the directory that ships in the
 * release ZIP (assets/ never does). Part of `npm run build:only`; bin/check-bundles.mjs verifies it.
 */
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const BLOCK_FILES = ['block.json', 'editor.js', 'editor.asset.php'];

const root = resolve(import.meta.dirname ?? new URL('.', import.meta.url).pathname, '..');
const source = join(root, 'assets/block');
const target = join(root, 'build/block');

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const file of BLOCK_FILES) copyFileSync(join(source, file), join(target, file));
console.log(`✓ block files copied to build/block (${BLOCK_FILES.join(', ')})`);
