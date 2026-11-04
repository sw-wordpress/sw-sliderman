import { validateDocument, type ValidationIssue } from '@shared/validate';
import type { SliderDocument } from '@shared/types';
import { ApiError, type Transport } from './client';

/** Typed access to `sw-sliderman/v1/sliders` (docs/rest-api.md); every response is validated. */

export type SliderStatus = 'unpublished' | 'published' | 'changed';

export interface SliderSummary {
  readonly id: number;
  readonly title: string;
  readonly status: SliderStatus;
  readonly version: number;
  readonly modifiedGmt: string;
  readonly publishedGmt: string | null;
  readonly shortcode: string;
}

export interface MediaInfo {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

export interface SliderRevision {
  readonly id: number;
  readonly title: string;
  readonly modifiedGmt: string;
  readonly autosave: boolean;
}

export interface SliderDetail extends SliderSummary {
  readonly previewUrl: string;
  readonly document: SliderDocument;
  /** Preview URLs of attachments referenced by the draft (editor display only). */
  readonly media: Readonly<Record<number, MediaInfo>>;
  readonly published: { readonly version: number; readonly publishedGmt: string } | null;
}

export type SaveDraftResult =
  | { readonly status: 'saved'; readonly version: number }
  | { readonly status: 'conflict'; readonly currentVersion: number }
  | { readonly status: 'invalid'; readonly issues: readonly ValidationIssue[] };

type Json = Record<string, unknown>;

function record(value: unknown): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError('sws_invalid_response', 'Unexpected response', 0);
  }
  return value as Json;
}

function int(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ApiError('sws_invalid_response', 'Unexpected response', 0);
  }
  return value;
}

function text(value: unknown): string {
  if (typeof value !== 'string')
    throw new ApiError('sws_invalid_response', 'Unexpected response', 0);
  return value;
}

function status(value: unknown): SliderStatus {
  if (value === 'unpublished' || value === 'published' || value === 'changed') return value;
  throw new ApiError('sws_invalid_response', 'Unexpected response', 0);
}

export function parseSummary(value: unknown): SliderSummary {
  const raw = record(value);
  return {
    id: int(raw.id),
    title: text(raw.title),
    status: status(raw.status),
    version: int(raw.version),
    modifiedGmt: text(raw.modifiedGmt),
    publishedGmt: raw.publishedGmt === null ? null : text(raw.publishedGmt),
    shortcode: text(raw.shortcode),
  };
}

export function parseDetail(value: unknown): SliderDetail {
  const raw = record(value);
  const document = validateDocument(raw.document);
  if (!document.ok)
    throw new ApiError('sws_invalid_document_response', 'Stored document is invalid', 0);
  const published = raw.published === null ? null : record(raw.published);
  return {
    ...parseSummary(raw),
    previewUrl: typeof raw.previewUrl === 'string' ? raw.previewUrl : '',
    media: parseMedia(raw.media),
    document: document.document,
    published: published
      ? { version: int(published.version), publishedGmt: text(published.publishedGmt) }
      : null,
  };
}

function parseMedia(value: unknown): Record<number, MediaInfo> {
  const out: Record<number, MediaInfo> = {};
  if (typeof value !== 'object' || value === null) return out;
  for (const [key, item] of Object.entries(value)) {
    const entry = typeof item === 'object' && item !== null ? (item as Json) : {};
    if (typeof entry.url === 'string' && /^\d+$/.test(key)) {
      out[Number(key)] = {
        url: entry.url,
        width: typeof entry.width === 'number' ? entry.width : 0,
        height: typeof entry.height === 'number' ? entry.height : 0,
      };
    }
  }
  return out;
}

function issues(value: unknown): ValidationIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const entry = typeof item === 'object' && item !== null ? (item as Json) : {};
    return typeof entry.path === 'string' && typeof entry.code === 'string'
      ? [{ path: entry.path, code: entry.code as ValidationIssue['code'] }]
      : [];
  });
}

export function slidersApi(client: Transport) {
  return {
    async list(search: string, page = 1, trashed = false): Promise<SliderSummary[]> {
      const body = await client.get('sliders', { search, page, perPage: 100, trashed });
      if (!Array.isArray(body))
        throw new ApiError('sws_invalid_response', 'Unexpected response', 0);
      return body.map(parseSummary);
    },
    async create(title: string): Promise<SliderDetail> {
      return parseDetail(await client.post('sliders', { title }));
    },
    async get(id: number, signal?: AbortSignal): Promise<SliderDetail> {
      return parseDetail(await client.get(`sliders/${id}`, {}, signal));
    },
    /** Never retried automatically: on timeout the caller re-reads the slider first. */
    async save(
      id: number,
      title: string,
      document: SliderDocument,
      expectedVersion: number,
    ): Promise<SaveDraftResult> {
      try {
        const body = record(
          await client.put(`sliders/${id}`, { title, document, expectedVersion }),
        );
        return { status: 'saved', version: int(body.version) };
      } catch (error) {
        if (error instanceof ApiError && error.code === 'sws_revision_conflict') {
          return { status: 'conflict', currentVersion: int(error.data.currentVersion) };
        }
        if (error instanceof ApiError && error.code === 'sws_invalid_document') {
          return { status: 'invalid', issues: issues(error.data.issues) };
        }
        throw error;
      }
    },
    async publish(id: number, version: number): Promise<{ version: number; publishedGmt: string }> {
      const body = record(await client.post(`sliders/${id}/publish`, { version }));
      return { version: int(body.version), publishedGmt: text(body.publishedGmt) };
    },
    async duplicate(id: number, title: string): Promise<SliderDetail> {
      return parseDetail(await client.post(`sliders/${id}/duplicate`, { title }));
    },
    async revisions(id: number): Promise<SliderRevision[]> {
      const body = await client.get(`sliders/${id}/revisions`);
      if (!Array.isArray(body))
        throw new ApiError('sws_invalid_response', 'Unexpected revisions', 0);
      return body.map((item) => {
        const raw = record(item);
        return {
          id: int(raw.id),
          title: text(raw.title),
          modifiedGmt: text(raw.modifiedGmt),
          autosave: raw.autosave === true,
        };
      });
    },
    async restore(id: number, revisionId: number, expectedVersion: number): Promise<void> {
      await client.post(`sliders/${id}/restore`, { revisionId, expectedVersion });
    },
    async trash(id: number): Promise<void> {
      await client.delete(`sliders/${id}`);
    },
    async untrash(id: number): Promise<void> {
      await client.post(`sliders/${id}/untrash`, {});
    },
    async purge(id: number): Promise<void> {
      await client.post(`sliders/${id}/purge`, {});
    },
  };
}

export function issuesOf(error: unknown): ValidationIssue[] {
  return error instanceof ApiError ? issues(error.data.issues) : [];
}
