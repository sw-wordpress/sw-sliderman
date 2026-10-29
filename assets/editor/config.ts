import type { EditorConfig } from '@editor/types/config';

let cached: EditorConfig | null = null;

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/** Validates the PHP-provided config. Throws if the REST root is missing. */
export function normaliseConfig(raw: unknown): EditorConfig {
  const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  if (typeof value.restRoot !== 'string' || value.restRoot === '') {
    throw new Error('window.swsEditorConfig.restRoot is missing');
  }
  return {
    restRoot: value.restRoot.endsWith('/') ? value.restRoot : `${value.restRoot}/`,
    nonce: str(value.nonce, ''),
    locale: str(value.locale, 'en_US'),
    userId: typeof value.userId === 'number' ? value.userId : 0,
    siteId: typeof value.siteId === 'number' ? value.siteId : 0,
    version: str(value.version, ''),
    adminUrl: str(value.adminUrl, ''),
    capabilities: Array.isArray(value.capabilities)
      ? value.capabilities.filter((c): c is string => typeof c === 'string')
      : [],
    fontsOffline: value.fontsOffline === true,
  };
}

export function getConfig(): EditorConfig {
  if (cached === null) cached = normaliseConfig(window.swsEditorConfig);
  return cached;
}

export function can(capability: 'sws_edit_sliders' | 'sws_publish_sliders' | 'sws_manage_fonts'): boolean {
  return getConfig().capabilities.includes(capability);
}
