import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * Frontend runtime: one dependency-free IIFE plus one stylesheet (no Vue, no Quasar).
 * Output: build/runtime/{runtime.js,runtime.css}. Budget checked by bin/check-bundles.mjs.
 */
export default defineConfig({
  publicDir: false,
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./assets/shared', import.meta.url)) },
  },
  build: {
    outDir: resolve(__dirname, 'build/runtime'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020',
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'assets/runtime/index.ts'),
      name: 'swsRuntime',
      formats: ['iife'],
      fileName: () => 'runtime.js',
      cssFileName: 'runtime',
    },
    rollupOptions: {
      output: { assetFileNames: 'runtime[extname]' },
    },
  },
});
