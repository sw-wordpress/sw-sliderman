import type { Plugin } from 'vite';

const LAZY_IMPORTS = ['/assets/browser/heroEffects.ts', '/assets/gpu/preview.ts'];

/** Keep the optional editor imports (hero effects, GPU preview) lazy, using the central PHP-provided plugin version. */
export function versionedEffects(): Plugin {
  return {
    name: 'sws-versioned-effects',
    apply: 'build',
    renderDynamicImport({ targetModuleId }) {
      if (!targetModuleId || !LAZY_IMPORTS.some((path) => targetModuleId.endsWith(path))) return null;
      return {
        left: 'import(',
        right: ' + "?ver=" + encodeURIComponent(window.swsEditorConfig.version))',
      };
    },
  };
}
