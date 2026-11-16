import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * Frontend runtime: one dependency-free IIFE plus one stylesheet (no Vue, no Quasar).
 * Output: build/runtime/{runtime.js,runtime.css}. Budget checked by bin/check-bundles.mjs.
 */
export default defineConfig({
  publicDir: false,
  resolve: {
    alias: { '@shared': resolve(import.meta.dirname, 'assets/shared') },
  },
  build: {
    outDir: resolve(import.meta.dirname, 'build/runtime'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020',
    cssCodeSplit: false,
    lib: {
      entry: resolve(import.meta.dirname, 'assets/runtime/index.ts'),
      name: 'swsRuntime',
      formats: ['iife'],
      fileName: () => 'runtime.js',
      cssFileName: 'runtime',
    },
    rolldownOptions: {
      output: { assetFileNames: 'runtime[extname]' },
    },
  },
});
