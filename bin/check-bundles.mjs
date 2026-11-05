#!/usr/bin/env node
/**
 * Post-build checks of the generated bundles (CODE-STYLE 13, 15; PLAN.md 11).
 *
 * - Runtime budget: JS <= 60 KiB gzip, CSS <= 25 KiB gzip.
 * - The runtime contains no Vue/Pinia/Quasar code.
 * - No bundle references a remote font host or uses @import (fonts are local only).
 * - Every selector of the editor stylesheet is scoped to `.sws-root` (no wp-admin bleed).
 *
 * This is a guard against regressions, not a replacement for the browser request recording
 * required by PLAN.md 16.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve(import.meta.dirname ?? new URL('.', import.meta.url).pathname, '..');
const failures = [];
const kib = (bytes) => Math.round((bytes / 1024) * 100) / 100;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const runtimeJs = readFileSync(join(root, 'build/runtime/runtime.js'));
const runtimeCss = readFileSync(join(root, 'build/runtime/runtime.css'));
const effectsJs = readFileSync(join(root, 'build/runtime/effects.js'));
const jsGzip = gzipSync(runtimeJs).length + gzipSync(effectsJs).length;
const cssGzip = gzipSync(runtimeCss).length;
console.log(`runtime + optional effects  ${kib(runtimeJs.length + effectsJs.length)} KiB (${kib(jsGzip)} KiB gzip, budget 60)`);
console.log(`runtime.css ${kib(runtimeCss.length)} KiB (${kib(cssGzip)} KiB gzip, budget 25)`);
if (jsGzip > 60 * 1024) failures.push('runtime.js exceeds 60 KiB gzip');
if (cssGzip > 25 * 1024) failures.push('runtime.css exceeds 25 KiB gzip');

const runtimeText = runtimeJs.toString('utf8') + effectsJs.toString('utf8');
for (const marker of ['__VUE', 'createApp', 'defineStore', 'pinia', 'quasar']) {
  if (runtimeText.includes(marker)) failures.push(`runtime.js contains editor code marker "${marker}"`);
}

const remoteFont = /fonts\.(googleapis|gstatic)\.com|use\.typekit|fonts\.bunny/i;
for (const file of [...files(join(root, 'build/runtime')), ...files(join(root, 'build/editor'))]) {
  if (!/\.(js|css)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  if (remoteFont.test(text)) failures.push(`${file} references a remote font host`);
  if (file.endsWith('.css') && /@import/i.test(text)) failures.push(`${file} uses @import`);
}

// The lazy effects import must use the central plugin version, including in production output.
const editorJs = files(join(root, 'build/editor'))
  .filter((file) => file.endsWith('.js'))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');
const versionedEffectsImport = /import\(["'][^"']*heroEffects[^"']*\?ver=["']\s*\+\s*encodeURIComponent\(window\.swsEditorConfig\.version\)\)/;
if (!versionedEffectsImport.test(editorJs)) failures.push('editor effects import lacks the central plugin version');

// The block ships from build/block (assets/ is not part of the release ZIP) and must match its source.
for (const file of ['block.json', 'editor.js', 'editor.asset.php']) {
  const built = join(root, 'build/block', file);
  if (!existsSync(built)) failures.push(`build/block/${file} is missing (run bin/build-block.mjs)`);
  else if (readFileSync(built, 'utf8') !== readFileSync(join(root, 'assets/block', file), 'utf8')) {
    failures.push(`build/block/${file} differs from assets/block/${file}`);
  }
}

// Editor CSS: every top-level selector must be scoped (keyframes and font-face excluded).
const editorCss = readFileSync(join(root, 'build/editor/editor.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** Splits a selector list at top-level commas (not inside :is()/:not() parentheses). */
function splitSelectors(list) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of list) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts;
}
const unscoped = new Set();
const rule = /(^|})\s*([^{}@][^{}]*)\{/g;
let match;
while ((match = rule.exec(editorCss)) !== null) {
  for (const selector of splitSelectors(match[2])) {
    if (selector === '' || /^(from|to|[\d.]+%)$/.test(selector)) continue;
    if (!/(^|\s|>)\.sws-|^body\.(sws-admin-page|q-body--prevent-scroll)/.test(selector)) unscoped.add(selector);
  }
}
if (unscoped.size > 0) failures.push(`editor.css has unscoped selectors: ${[...unscoped].slice(0, 10).join(' | ')}`);

if (failures.length > 0) {
  console.error(failures.map((f) => `✖ ${f}`).join('\n'));
  process.exit(1);
}
console.log('✓ bundle checks passed');
