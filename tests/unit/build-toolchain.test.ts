// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { expect, it } from 'vitest';
import { versionedEffects } from '../../tools/versionedEffects.ts';

it.each([false, true])('keeps versioned imports lazy with minify=%s', async (minify) => {
  const root = await mkdtemp(join(tmpdir(), 'sws-build-'));
  try {
    for (const module of ['browser/heroEffects', 'gpu/preview', 'other']) {
      const file = join(root, `assets/${module}.ts`);
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file, `export const marker = ${JSON.stringify(module)};`);
    }
    await writeFile(
      join(root, 'entry.ts'),
      `window.loadEffects = () => import('./assets/browser/heroEffects.ts');
       window.loadGpu = () => import('./assets/gpu/preview.ts');
       window.loadOther = () => import('./assets/other.ts');`,
    );
    const result = await build({
      root,
      configFile: false,
      envFile: false,
      publicDir: false,
      logLevel: 'silent',
      plugins: [versionedEffects()],
      build: {
        write: false,
        minify,
        modulePreload: false,
        rolldownOptions: { input: join(root, 'entry.ts') },
      },
    });
    const outputs = Array.isArray(result) ? result : [result];
    const chunks = outputs.flatMap((output) => ('output' in output ? output.output : []));
    const entry = chunks.find((chunk) => chunk.type === 'chunk' && chunk.isEntry);
    if (!entry || entry.type !== 'chunk') throw new Error('Missing editor entry');
    expect(chunks.filter((chunk) => chunk.type === 'chunk')).toHaveLength(4);
    for (const name of ['heroEffects', 'preview']) {
      expect(entry.code).toMatch(
        new RegExp(
          `import\\(["'\x60][^"'\x60]*${name}[^"'\x60]*\\?ver=["'\x60]\\s*\\+\\s*encodeURIComponent\\(window\\.swsEditorConfig\\.version\\)\\)`,
        ),
      );
    }
    expect(entry.code).toMatch(/import\(["'`][^"'`]*other[^"'`]*["'`]\)/);
    expect(entry.code.match(/encodeURIComponent/g)).toHaveLength(2);

    // Run the real bundle guard against emitted code, including Rolldown's minified literals.
    for (const dir of [
      'bin',
      'build/editor',
      'build/runtime',
      'build/gpu',
      'build/block',
      'assets/block',
    ]) {
      await mkdir(join(root, dir), { recursive: true });
    }
    await copyFile(
      new URL('../../bin/check-bundles.mjs', import.meta.url),
      join(root, 'bin/check-bundles.mjs'),
    );
    for (const file of ['block.json', 'editor.js', 'editor.asset.php']) {
      const source = new URL(`../../assets/block/${file}`, import.meta.url);
      await copyFile(source, join(root, `assets/block/${file}`));
      await copyFile(source, join(root, `build/block/${file}`));
    }
    for (const file of [
      'runtime/runtime.js',
      'runtime/runtime.css',
      'runtime/effects.js',
      'gpu/gpu.js',
    ]) {
      await writeFile(join(root, `build/${file}`), '');
    }
    await writeFile(join(root, 'build/editor/editor.css'), '.sws-root { color: red; }');
    const editor = join(root, 'build/editor/editor.js');
    const checkBundles = () =>
      execFileSync(process.execPath, [join(root, 'bin/check-bundles.mjs')], { stdio: 'pipe' });
    await writeFile(editor, entry.code);
    expect(checkBundles().toString()).toContain('bundle checks passed');
    for (const invalid of [
      entry.code.replaceAll('?ver=', ''),
      entry.code.replaceAll('encodeURIComponent', 'String'),
    ]) {
      await writeFile(editor, invalid);
      expect(checkBundles).toThrow(/editor effects import lacks the central plugin version/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
