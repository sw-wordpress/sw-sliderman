import { ApiError, type Transport } from './client';

/** Typed access to `sw-sliderman/v1/fonts` (docs/rest-api.md). */

export interface FontVariant {
  readonly weight: number;
  readonly style: 'normal' | 'italic';
}

export interface CatalogFamily {
  readonly id: string;
  readonly family: string;
  readonly category: string;
  readonly license: string;
  readonly static: boolean;
  readonly subsets: readonly string[];
  readonly variants: readonly FontVariant[];
  readonly installed: boolean;
}

export interface FontCatalogResponse {
  readonly catalogVersion: string;
  readonly offline: boolean;
  readonly families: readonly CatalogFamily[];
}

export interface FontInstallation {
  readonly id: string;
  readonly familyId: string;
  readonly family: string;
  readonly category: string;
  readonly variants: ReadonlyArray<FontVariant & { readonly subsets: readonly string[] }>;
  readonly stylesheetUrl: string | null;
  readonly licenseId: string;
  readonly licenseUrl: string | null;
  readonly installedGmt: string;
  readonly filesPresent: boolean;
  readonly inUse: boolean;
}

type Json = Record<string, unknown>;

function bad(): never {
  throw new ApiError('sws_invalid_response', 'Unexpected response', 0);
}
function record(value: unknown): Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : bad();
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : bad();
}
function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text) : bad();
}
function variant(value: unknown): FontVariant {
  const raw = record(value);
  const weight = typeof raw.weight === 'number' ? raw.weight : bad();
  const style = raw.style === 'italic' ? 'italic' : raw.style === 'normal' ? 'normal' : bad();
  return { weight, style };
}

/** Local same-origin stylesheet URLs only (never a remote font host). */
function localUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    return new URL(value, window.location.href).origin === window.location.origin ? value : null;
  } catch {
    return null;
  }
}

function family(value: unknown): CatalogFamily {
  const raw = record(value);
  return {
    id: text(raw.id),
    family: text(raw.family),
    category: text(raw.category),
    license: text(raw.license),
    static: raw.static === true,
    subsets: texts(raw.subsets),
    variants: Array.isArray(raw.variants) ? raw.variants.map(variant) : bad(),
    installed: raw.installed === true,
  };
}

export function parseInstallation(value: unknown): FontInstallation {
  const raw = record(value);
  return {
    id: text(raw.id),
    familyId: text(raw.familyId),
    family: text(raw.family),
    category: text(raw.category),
    variants: Array.isArray(raw.variants)
      ? raw.variants.map((v) => ({ ...variant(v), subsets: texts(record(v).subsets) }))
      : bad(),
    stylesheetUrl: localUrl(raw.stylesheetUrl),
    licenseId: text(raw.licenseId),
    licenseUrl: localUrl(raw.licenseUrl),
    installedGmt: text(raw.installedGmt),
    filesPresent: raw.filesPresent === true,
    inUse: raw.inUse === true,
  };
}

export function fontsApi(client: Transport) {
  return {
    async catalog(): Promise<FontCatalogResponse> {
      const raw = record(await client.get('fonts/catalog'));
      return {
        catalogVersion: text(raw.catalogVersion),
        offline: raw.offline === true,
        families: Array.isArray(raw.families) ? raw.families.map(family) : bad(),
      };
    },
    async installations(): Promise<FontInstallation[]> {
      const raw = await client.get('fonts');
      return Array.isArray(raw) ? raw.map(parseInstallation) : bad();
    },
    /** Server-side download; can take a while for many variants. */
    async install(familyId: string, variants: FontVariant[], subsets: string[]): Promise<FontInstallation> {
      return parseInstallation(await client.post('fonts', { familyId, variants, subsets }, { timeoutMs: 120000 }));
    },
    async uninstall(id: string): Promise<void> {
      await client.delete(`fonts/${encodeURIComponent(id)}`);
    },
  };
}
