import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/** Optional effects stay out of the base IIFE; WordPress controls loading and versioning. */
export default defineConfig({
  publicDir: false,
  resolve: {
    alias: { '@shared': resolve(import.meta.dirname, 'assets/shared') },
  },
  build: {
    outDir: resolve(import.meta.dirname, 'build/runtime'),
    emptyOutDir: false,
    target: 'es2020',
    lib: {
      entry: resolve(import.meta.dirname, 'assets/effects/index.ts'),
      name: 'swsEffects',
      formats: ['iife'],
      fileName: () => 'effects.js',
    },
  },
});
