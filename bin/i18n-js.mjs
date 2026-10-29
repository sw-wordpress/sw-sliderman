#!/usr/bin/env node
/**
 * Script translations of the editor (CODE-STYLE 14.3).
 *
 *   node bin/i18n-js.mjs check   -> every __()/_n() string of assets/editor has a German translation,
 *                                   no stale entries exist, placeholders match (exit 1 otherwise)
 *   node bin/i18n-js.mjs build   -> writes languages/sw-sliderman-de_DE-sws-editor.json (Jed format,
 *                                   loaded by wp_set_script_translations for the handle "sws-editor")
 *   node bin/i18n-js.mjs missing -> prints untranslated strings as JSON (to extend the catalog)
 *
 * Source of truth for German texts: languages/src/editor-de_DE.json (msgid -> msgstr).
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('.', import.meta.url).pathname, '..');
const catalogFile = join(root, 'languages/src/editor-de_DE.json');
const outFile = join(root, 'languages/sw-sliderman-de_DE-sws-editor.json');

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|vue)$/.test(name) ? [path] : [];
  });
}

function unquote(literal) {
  return literal.slice(1, -1).replace(/\\(['"\\])/g, '$1');
}

const strings = new Set();
const call = /\b(?:__|_n)\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")(?:\s*,\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"))?/g;
for (const file of files(join(root, 'assets/editor'))) {
  if (file.endsWith('i18n.ts')) continue;
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(call)) {
    strings.add(unquote(match[1]));
    if (match[0].startsWith('_n') && match[2]) strings.add(unquote(match[2]));
  }
}

const catalog = JSON.parse(readFileSync(catalogFile, 'utf8'));
const placeholders = (text) => (text.match(/%(\d+\$)?[sd]/g) ?? []).sort().join(',');
const missing = [...strings].filter((s) => !(s in catalog)).sort();
const stale = Object.keys(catalog).filter((s) => !strings.has(s)).sort();
const mismatched = Object.entries(catalog).filter(([id, text]) => strings.has(id) && placeholders(id) !== placeholders(text));

const mode = process.argv[2] ?? 'check';
if (mode === 'missing') {
  console.log(JSON.stringify(Object.fromEntries(missing.map((s) => [s, ''])), null, 2));
  process.exit(0);
}
if (mode === 'check') {
  const problems = [
    ...missing.map((s) => `missing: ${s}`),
    ...stale.map((s) => `stale: ${s}`),
    ...mismatched.map(([id]) => `placeholder mismatch: ${id}`),
    ...Object.entries(catalog).filter(([, t]) => t === '').map(([id]) => `empty: ${id}`),
  ];
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`✓ ${strings.size} editor strings translated (de_DE)`);
  process.exit(0);
}
if (mode === 'build') {
  const messages = { '': { domain: 'messages', lang: 'de_DE', 'plural-forms': 'nplurals=2; plural=(n != 1);' } };
  for (const id of [...strings].sort()) if (catalog[id]) messages[id] = [catalog[id]];
  const jed = { 'translation-revision-date': '2026-10-29 00:00+0000', generator: 'bin/i18n-js.mjs', domain: 'messages', locale_data: { messages } };
  writeFileSync(outFile, `${JSON.stringify(jed)}\n`);
  console.log(`✓ ${outFile}`);
  process.exit(0);
}
console.error('usage: node bin/i18n-js.mjs check|build|missing');
process.exit(2);
