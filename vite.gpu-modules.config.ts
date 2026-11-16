import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * Built-in GPU effect modules (ADR 0005): every `assets/gpu/modules/<name>/index.ts` becomes the
 * self-contained ES file `build/gpu/<name>.js`, loaded on demand by the platform. Runs after
 * vite.gpu.config.ts (which empties build/gpu); budgets per module in bin/check-bundles.mjs.
 */
const modulesDir = resolve(import.meta.dirname, 'assets/gpu/modules');
const entries = Object.fromEntries(
  readdirSync(modulesDir)
    .filter((name) => existsSync(resolve(modulesDir, name, 'index.ts')))
    .map((name) => [name, resolve(modulesDir, name, 'index.ts')]),
);

export default defineConfig({
  publicDir: false,
  resolve: {
    alias: {
      '@shared': resolve(import.meta.dirname, 'assets/shared'),
      '@gpu': resolve(import.meta.dirname, 'assets/gpu'),
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, 'build/gpu'),
    emptyOutDir: false,
    sourcemap: false,
    target: 'es2020',
    lib: { entry: entries, formats: ['es'], fileName: (_format, name) => `${name}.js` },
    rolldownOptions: { output: { codeSplitting: true } },
  },
});
