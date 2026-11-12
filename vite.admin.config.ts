import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    outDir: 'build/admin',
    emptyOutDir: true,
    lib: {
      entry: 'assets/updates/updates.ts',
      name: 'swsUpdateChecks',
      formats: ['iife'],
      fileName: () => 'updates.js',
    },
  },
});
