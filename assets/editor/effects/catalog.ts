import type { EffectCatalog } from '@shared/validate';
import type { EffectInfo } from '@editor/types/config';
import { getConfig } from '@editor/config';

/** The effect types the server registered (empty outside WordPress, e.g. in unit tests). */
export function effectInfos(): readonly EffectInfo[] {
  try {
    return getConfig().effects;
  } catch {
    return [];
  }
}

export function effectInfo(type: string): EffectInfo | null {
  return effectInfos().find((info) => info.type === type) ?? null;
}

/** Lets the shared validator check effect parameters against the registered schemas. */
export const effectCatalog: EffectCatalog = {
  find: (type) => {
    const info = effectInfo(type);
    return info ? { schemaVersion: info.schemaVersion, schema: info.schema } : null;
  },
};
