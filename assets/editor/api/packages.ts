import { __ } from '@editor/i18n';
import { ApiError, type Transport } from './client';

export interface PackagePreview {
  token: string;
  title: string;
  complete: boolean;
  conflicts: string[];
  media: { id: number; file: string | null; alt: string }[];
  fonts: { id: string; family: string }[];
}
export interface ImportJob {
  state: 'ready' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
  id: number | null;
  done: number;
  total: number;
  message: string;
}

export function parseJob(value: unknown): ImportJob {
  const raw = record(value);
  const state = raw.state;
  if (
    state !== 'ready' &&
    state !== 'queued' &&
    state !== 'running' &&
    state !== 'completed' &&
    state !== 'failed' &&
    state !== 'cancelled' &&
    state !== 'unknown'
  )
    throw new ApiError('sws_invalid_response', 'Invalid import state', 0);
  if (
    typeof raw.done !== 'number' ||
    !Number.isSafeInteger(raw.done) ||
    raw.done < 0 ||
    typeof raw.total !== 'number' ||
    !Number.isSafeInteger(raw.total) ||
    raw.total < raw.done
  )
    throw new ApiError('sws_invalid_response', 'Invalid import progress', 0);
  return {
    state,
    id: raw.id === null ? null : id(raw.id),
    done: raw.done,
    total: raw.total,
    message: typeof raw.message === 'string' ? raw.message : '',
  };
}

export interface LocalTemplate {
  id: string;
  name: string;
  version: number;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError('sws_invalid_response', 'Unexpected package response', 0);
  }
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError('sws_invalid_response', 'Invalid text', 0);
  return value;
}
function id(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new ApiError('sws_invalid_response', 'Invalid identity', 0);
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new ApiError('sws_invalid_response', 'Invalid list', 0);
  return value;
}

export function parsePreview(value: unknown): PackagePreview {
  const raw = record(value);
  if (typeof raw.complete !== 'boolean')
    throw new ApiError('sws_invalid_response', 'Invalid completeness', 0);
  const token = text(raw.token);
  if (!/^[a-f0-9]{32}$/.test(token))
    throw new ApiError('sws_invalid_response', 'Invalid session', 0);
  return {
    token,
    title: text(raw.title),
    complete: raw.complete,
    conflicts: raw.conflicts === undefined ? [] : list(raw.conflicts).map(text),
    media: list(raw.media).map((value) => {
      const item = record(value);
      return {
        id: id(item.id),
        file: item.file === null ? null : text(item.file),
        alt: text(item.alt),
      };
    }),
    fonts: list(raw.fonts).map((value) => {
      const item = record(value);
      return { id: text(item.id), family: text(item.family) };
    }),
  };
}

export function packagesApi(client: Transport) {
  return {
    async preview(archive: File): Promise<PackagePreview> {
      const form = new FormData();
      form.append('archive', archive);
      return parsePreview(await client.post('packages/preview', form, { timeoutMs: 180000 }));
    },
    async commit(
      token: string,
      media: Record<string, number>,
      fonts: Record<string, string>,
    ): Promise<number> {
      let job = parseJob(await client.post('packages/commit', { token, media, fonts }));
      if (job.state === 'queued' || job.state === 'running') {
        try {
          job = parseJob(await client.post('packages/run', { token }, { timeoutMs: 180000 }));
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== 'sws_busy') throw error;
          job = parseJob(await client.get('packages/status', { token }));
        }
      }
      // A concurrent cron worker owns the operation. Reads never restart a creation.
      const deadline = Date.now() + 180000;
      while ((job.state === 'running' || job.state === 'queued') && Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        job = parseJob(await client.get('packages/status', { token }));
      }
      if (job.state !== 'completed' || job.id === null)
        throw new ApiError(
          `sws_package_${job.state}`,
          job.message || __('The import status is uncertain. Check its status before retrying.'),
          422,
        );
      return job.id;
    },
    async status(token: string): Promise<ImportJob> {
      return parseJob(await client.get('packages/status', { token }));
    },
    async cancel(token: string): Promise<number | null> {
      const body = record(await client.post('packages/cancel', { token }));
      return body.state === 'completed' ? id(body.id) : null;
    },
    async export(sliderId: number, includeFiles: boolean): Promise<string> {
      const url = text(
        record(
          await client.post(
            'packages/export',
            { id: sliderId, includeFiles },
            { timeoutMs: 180000 },
          ),
        ).url,
      );
      const target = new URL(url, window.location.href);
      if (
        target.origin !== window.location.origin ||
        !['http:', 'https:'].includes(target.protocol)
      )
        throw new ApiError('sws_invalid_response', 'Invalid download origin', 0);
      return target.href;
    },
    async templates(): Promise<LocalTemplate[]> {
      return list(await client.get('templates')).map((value) => {
        const item = record(value);
        return { id: text(item.id), name: text(item.name), version: id(item.version) };
      });
    },
    async fromTemplate(template: string): Promise<number> {
      if (!['image-slider', 'text-hero', 'event'].includes(template))
        throw new ApiError('sws_invalid_template', 'Invalid template', 0);
      return id(record(await client.post(`templates/${template}`, {}, { timeoutMs: 180000 })).id);
    },
  };
}
