import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { quasar, transformAssetUrls } from '@quasar/vite-plugin';
import { swsScope } from './tools/postcssScope';
import { versionedEffects } from './tools/versionedEffects';

/** Ship only the woff2 icon font (all supported browsers); drops the legacy woff. */
function woff2Only() {
  return {
    name: 'sws-woff2-only',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!id.includes('material-icons-round.css')) return null;
      return code.replace(/,\s*url\([^)]*\.woff\d?\??[^)]*\)\s*format\((['"])woff\1\)/g, '');
    },
  };
}

/**
 * Admin editor bundle (Vue + Quasar). Output: build/editor/{editor.js,editor.css,chunks,assets}.
 * `wp.i18n` and `wp.media` are provided by WordPress at runtime and never bundled.
 */
export default defineConfig({
  base: './',
  plugins: [woff2Only(), versionedEffects(), vue({ template: { transformAssetUrls } }), quasar()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./assets/shared', import.meta.url)),
      '@gpu': fileURLToPath(new URL('./assets/gpu', import.meta.url)),
      '@editor': fileURLToPath(new URL('./assets/editor', import.meta.url)),
    },
  },
  css: { postcss: { plugins: [swsScope()] } },
  server: { port: 5174, host: '127.0.0.1' },
  build: {
    outDir: resolve(__dirname, 'build/editor'),
    emptyOutDir: true,
    manifest: true,
    cssCodeSplit: false,
    sourcemap: false,
    target: 'es2020',
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { editor: resolve(__dirname, 'assets/editor/main.ts') },
      output: {
        entryFileNames: 'editor.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (info) => {
          const names = info.names ?? (info.name ? [info.name] : []);
          return names.some((n) => n.endsWith('.css'))
            ? 'editor.css'
            : 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
});
