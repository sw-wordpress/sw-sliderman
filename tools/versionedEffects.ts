import { posix } from 'node:path';
import type { Plugin } from 'vite';

const LAZY_IMPORTS = ['/assets/browser/heroEffects.ts', '/assets/gpu/preview.ts'];

/** Keep the optional editor imports (hero effects, GPU preview) lazy, using the central PHP-provided plugin version. */
export function versionedEffects(): Plugin {
  return {
    name: 'sws-versioned-effects',
    apply: 'build',
    // Rolldown has no renderDynamicImport hook. Rewrite emitted references before chunk hashing.
    renderChunk(code, chunk, _options, meta) {
      const targets = new Set(
        Object.values(meta.chunks)
          .filter((target) =>
            LAZY_IMPORTS.some((path) => target.facadeModuleId?.replace(/\\/g, '/').endsWith(path)),
          )
          .map((target) => target.fileName),
      );
      const rewritten = code.replace(
        /\bimport\(\s*(['"])([^'"]+)\1\s*\)/g,
        (original: string, quote: string, specifier: string) => {
          const target = posix.normalize(posix.join(posix.dirname(chunk.fileName), specifier));
          if (!targets.has(target)) return original;
          return `import(${quote}${specifier}?ver=${quote} + encodeURIComponent(window.swsEditorConfig.version))`;
        },
      );
      return rewritten === code ? null : { code: rewritten, map: null };
    },
  };
}
