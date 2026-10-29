import { ref } from 'vue';
import { fonts as fontsApi } from '@editor/api';
import type { FontInstallation } from '@editor/api/fonts';

/**
 * Shared list of locally installed fonts. Their stylesheets are same-origin files; a stylesheet
 * link is added once per installation so the editor can render (and measure) the font. Never
 * a request to a remote font host (PLAN.md 8.1).
 */
const installations = ref<FontInstallation[]>([]);
const loaded = ref(false);
let pending: Promise<void> | null = null;

function ensureStylesheet(installation: FontInstallation): void {
  if (!installation.stylesheetUrl) return;
  const id = `sws-font-${installation.id}-css`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = installation.stylesheetUrl;
  document.head.appendChild(link);
}

export function useInstalledFonts() {
  async function refresh(): Promise<void> {
    pending ??= fontsApi
      .installations()
      .then((list) => {
        installations.value = list;
        list.forEach(ensureStylesheet);
        loaded.value = true;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }
  if (!loaded.value && !pending) void refresh().catch((error: unknown) => console.error(error));
  return { installations, loaded, refresh };
}
