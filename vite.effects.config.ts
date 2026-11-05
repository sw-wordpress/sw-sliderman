import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/** Optional effects stay out of the base IIFE; WordPress controls loading and versioning. */
export default defineConfig({
  publicDir: false,
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./assets/shared', import.meta.url)) },
  },
  build: {
    outDir: resolve(__dirname, 'build/runtime'),
    emptyOutDir: false,
    target: 'es2020',
    lib: {
      entry: resolve(__dirname, 'assets/effects/index.ts'),
      name: 'swsEffects',
      formats: ['iife'],
      fileName: () => 'effects.js',
    },
  },
});
