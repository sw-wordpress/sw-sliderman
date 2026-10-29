export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;

/** Normalised error for every failed request (HTTP, WP_Error or network). */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  /** `data` of the WP_Error without `status` (e.g. `currentVersion`, `issues`). */
  readonly data: Readonly<Record<string, unknown>>;

  constructor(code: string, message: string, status: number, data: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.data = data;
  }

  get isAborted(): boolean {
    return this.code === 'sws_aborted';
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** Client-side timeout; the server may still complete the request (check state before retrying). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30000;

export interface ClientOptions {
  restRoot: string;
  nonce: string;
  fetchImpl?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Turn any non-OK response body into an ApiError. Exported for tests. */
export function normaliseError(status: number, body: unknown): ApiError {
  if (isRecord(body) && typeof body.code === 'string' && typeof body.message === 'string') {
    const data = isRecord(body.data) ? { ...body.data } : {};
    const dataStatus = typeof data.status === 'number' ? data.status : status;
    delete data.status;
    return new ApiError(body.code, body.message, dataStatus, data);
  }
  return new ApiError(`sws_http_${status}`, `HTTP ${status}`, status);
}

/**
 * The single HTTP gateway of the app. Adds the REST nonce, sends cookies, speaks JSON and
 * normalises errors. Components must never call `fetch` directly.
 */
export class ApiClient {
  private readonly root: string;
  private nonce: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ClientOptions) {
    this.root = options.restRoot.endsWith('/') ? options.restRoot : `${options.restRoot}/`;
    this.nonce = options.nonce;
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  }

  /** Absolute URL for a resource path (no leading slash) incl. query string. */
  url(path: string, query?: Query): string {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      qs.set(key, String(value));
    }
    const rel = path.replace(/^\/+/, '');
    const base = `${this.root}${rel}`;
    const str = qs.toString();
    if (str === '') return base;
    // WP without pretty permalinks uses `?rest_route=`, so the root may already contain `?`.
    return `${base}${base.includes('?') ? '&' : '?'}${str}`;
  }

  /** Returns the parsed JSON body as `unknown`; callers validate it (CODE-STYLE 11). */
  async request(method: string, path: string, options: RequestOptions = {}): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-WP-Nonce': this.nonce,
    };
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const onAbort = (): void => timeout.abort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const init: RequestInit = {
      method,
      headers,
      credentials: 'same-origin',
      signal: timeout.signal,
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.url(path, options.query), init);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw options.signal?.aborted
          ? new ApiError('sws_aborted', 'Request aborted', 0)
          : new ApiError('sws_timeout', 'Request timed out', 0);
      }
      throw new ApiError('sws_network', 'Network error', 0);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }

    const refreshed = response.headers.get('X-WP-Nonce');
    if (refreshed) this.nonce = refreshed;

    let parsed: unknown = null;
    const text = await response.text();
    if (text !== '') {
      try {
        parsed = JSON.parse(text);
      } catch {
        if (response.ok) {
          throw new ApiError('sws_invalid_response', 'Invalid JSON response', response.status);
        }
      }
    }

    if (!response.ok) throw normaliseError(response.status, parsed);
    return parsed;
  }

  get(path: string, query: Query = {}, signal?: AbortSignal): Promise<unknown> {
    return this.request('GET', path, signal ? { query, signal } : { query });
  }
  post(path: string, body: unknown = {}, options: Omit<RequestOptions, 'body'> = {}): Promise<unknown> {
    return this.request('POST', path, { ...options, body });
  }
  put(path: string, body: unknown, options: Omit<RequestOptions, 'body'> = {}): Promise<unknown> {
    return this.request('PUT', path, { ...options, body });
  }
  delete(path: string): Promise<unknown> {
    return this.request('DELETE', path);
  }
}

/** The request methods resource modules depend on (lets tests pass a fake). */
export type Transport = Pick<ApiClient, 'get' | 'post' | 'put' | 'delete'>;
