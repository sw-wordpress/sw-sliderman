import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { quasar } from '@quasar/vite-plugin';

export default defineConfig({
  plugins: [vue(), quasar()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./assets/shared', import.meta.url)),
      '@editor': fileURLToPath(new URL('./assets/editor', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['assets/**/*.{ts,vue}'],
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage/js',
      thresholds: { lines: 80.01 },
    },
    server: { deps: { inline: ['quasar'] } },
  },
});
