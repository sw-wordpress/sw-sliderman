import type { Plugin } from 'vite';

/** Keep the optional editor import lazy, using the central PHP-provided plugin version. */
export function versionedEffects(): Plugin {
  return {
    name: 'sws-versioned-effects',
    apply: 'build',
    renderDynamicImport({ targetModuleId }) {
      if (!targetModuleId?.endsWith('/assets/browser/heroEffects.ts')) return null;
      return {
        left: 'import(',
        right: ' + "?ver=" + encodeURIComponent(window.swsEditorConfig.version))',
      };
    },
  };
}
