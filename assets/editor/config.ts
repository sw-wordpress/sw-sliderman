import type { EditorConfig, EffectInfo, EffectPresetInfo } from '@editor/types/config';

let cached: EditorConfig | null = null;

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function effectInfos(raw: unknown): EffectInfo[] {
  if (!Array.isArray(raw)) return [];
  const infos: EffectInfo[] = [];
  for (const item of raw) {
    if (
      !isRecord(item) ||
      typeof item.type !== 'string' ||
      typeof item.module !== 'string' ||
      !isRecord(item.schema)
    )
      continue;
    const presets: EffectPresetInfo[] = Array.isArray(item.presets)
      ? item.presets.filter(isRecord).flatMap((p) =>
          typeof p.id === 'string' && isRecord(p.params)
            ? [
                {
                  id: p.id,
                  name: str(p.name, p.id),
                  description: str(p.description, ''),
                  seed: typeof p.seed === 'number' ? p.seed : 0,
                  params: p.params,
                },
              ]
            : [],
        )
      : [];
    const assets = Array.isArray(item.assets)
      ? item.assets
          .filter(isRecord)
          .flatMap((a) =>
            typeof a.key === 'string' ? [{ key: a.key, label: str(a.label, a.key) }] : [],
          )
      : [];
    infos.push({
      type: item.type,
      label: str(item.label, item.type),
      description: str(item.description, ''),
      category: str(item.category, ''),
      continuous: item.continuous !== false,
      schemaVersion: typeof item.schemaVersion === 'number' ? item.schemaVersion : 1,
      schema: item.schema,
      presets,
      assets,
      module: item.module,
      builtin: item.builtin === true,
    });
  }
  return infos;
}

/** Validates the PHP-provided config. Throws if the REST root is missing. */
export function normaliseConfig(raw: unknown): EditorConfig {
  const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  if (typeof value.restRoot !== 'string' || value.restRoot === '') {
    throw new Error('window.swsEditorConfig.restRoot is missing');
  }
  return {
    restRoot: value.restRoot.endsWith('/') ? value.restRoot : `${value.restRoot}/`,
    coreRestRoot: str(value.coreRestRoot, '').replace(/\/?$/, '/'),
    effects: effectInfos(value.effects),
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

export function can(
  capability: 'sws_edit_sliders' | 'sws_publish_sliders' | 'sws_manage_fonts',
): boolean {
  return getConfig().capabilities.includes(capability);
}
