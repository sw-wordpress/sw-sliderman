import { fileURLToPath, URL } from 'node:url';
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
      '@shared': fileURLToPath(new URL('./assets/shared', import.meta.url)),
      '@gpu': fileURLToPath(new URL('./assets/gpu', import.meta.url)),
    },
  },
  build: {
    outDir: resolve(__dirname, 'build/gpu'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020',
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'assets/gpu/index.ts'),
      name: 'swsGpu',
      formats: ['iife'],
      fileName: () => 'gpu.js',
    },
  },
});
