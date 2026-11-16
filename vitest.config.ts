import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { quasar } from '@quasar/vite-plugin';

export default defineConfig({
  plugins: [vue(), quasar()],
  resolve: {
    alias: {
      '@shared': resolve(import.meta.dirname, 'assets/shared'),
      '@editor': resolve(import.meta.dirname, 'assets/editor'),
      '@gpu': resolve(import.meta.dirname, 'assets/gpu'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['assets/**/*.{ts,vue,js}'],
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage/js',
      thresholds: { lines: 80.01 },
    },
    server: { deps: { inline: ['quasar'] } },
  },
});
