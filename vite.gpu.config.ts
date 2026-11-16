import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * Optional GPU platform bundle (ADR 0005): one dependency-free classic script that registers
 * `window.swsGpu`. Effect modules are separate ES files loaded on demand (vite.gpu-modules.config.ts).
 * Output: build/gpu/gpu.js. Runs after vite.runtime.config.ts; budget checked by bin/check-bundles.mjs.
 */
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
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020',
    cssCodeSplit: false,
    lib: {
      entry: resolve(import.meta.dirname, 'assets/gpu/index.ts'),
      name: 'swsGpu',
      formats: ['iife'],
      fileName: () => 'gpu.js',
    },
  },
});
