import { computed, ref } from 'vue';
import { boundedFontWait } from '../../browser/fonts';
import type { FontRef } from '@shared/types';
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

const stylesheets = new Map<string, Promise<boolean>>();
function ensureStylesheet(installation: FontInstallation): Promise<boolean> {
  if (!installation.stylesheetUrl || !installation.filesPresent || installation.originMismatch)
    return Promise.resolve(false);
  const id = `sws-font-${installation.id}-css`;
  const existing = document.getElementById(id) as HTMLLinkElement | null;
  if (existing?.sheet || existing?.dataset.swsLoaded === 'true') return Promise.resolve(true);
  const pendingStyle = stylesheets.get(id);
  if (pendingStyle) return pendingStyle;
  const link = existing ?? document.createElement('link');
  const task = new Promise<boolean>((resolve) => {
    const finish = (ok: boolean): void => {
      window.clearTimeout(timer);
      link.removeEventListener('load', loaded);
      link.removeEventListener('error', failed);
      if (ok) link.dataset.swsLoaded = 'true';
      else link.remove();
      resolve(ok);
    };
    const loaded = (): void => finish(true);
    const failed = (): void => finish(false);
    const timer = window.setTimeout(failed, 1200);
    link.addEventListener('load', loaded, { once: true });
    link.addEventListener('error', failed, { once: true });
    if (!existing) {
      link.id = id;
      link.rel = 'stylesheet';
      link.href = installation.stylesheetUrl ?? '';
      document.head.appendChild(link);
    }
  }).finally(() => {
    stylesheets.delete(id);
  });
  stylesheets.set(id, task);
  return task;
}

export function useInstalledFonts() {
  async function refresh(): Promise<void> {
    pending ??= fontsApi
      .installations()
      .then((list) => {
        installations.value = list;
        list.forEach((item) => {
          void ensureStylesheet(item);
        });
        loaded.value = true;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }
  if (!loaded.value && !pending) void refresh().catch((error: unknown) => console.error(error));
  const available = computed(() =>
    installations.value.filter(
      (item) => item.filesPresent && !item.originMismatch && item.stylesheetUrl !== null,
    ),
  );
  async function readyFor(refs: readonly FontRef[], signal?: AbortSignal): Promise<boolean> {
    if (refs.length === 0) return true;
    return boundedFontWait(
      (async () => {
        if (!loaded.value) await refresh();
        const results = await Promise.all(
          refs.map(async (ref) => {
            const installation = available.value.find(
              (item) =>
                item.id === ref.installationId &&
                item.variants.some((v) => v.weight === ref.weight && v.style === ref.style),
            );
            if (
              !installation ||
              signal?.aborted ||
              !(await ensureStylesheet(installation)) ||
              !document.fonts?.load
            )
              return false;
            const faces = await document.fonts.load(
              `${ref.style} ${ref.weight} 16px "sws-${ref.installationId}"`,
              'ÄÖÜäöüß €',
            );
            return faces.length > 0;
          }),
        );
        return results.every(Boolean);
      })(),
      signal,
    );
  }
  return { installations, available, loaded, refresh, readyFor };
}
