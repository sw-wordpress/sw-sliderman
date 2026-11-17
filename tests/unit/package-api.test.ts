import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, type Transport } from '@editor/api/client';
import { packagesApi, parsePreview } from '@editor/api/packages';

const token = 'a'.repeat(32);
const preview = {
  token,
  title: 'Hero',
  conflicts: [],
  complete: true,
  media: [{ id: 4, file: 'media/photo.png', alt: 'View' }],
  fonts: [{ id: 'local', family: 'Lato' }],
};
function fake(): Transport {
  return { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
}

describe('portable package API', () => {
  it('validates previews and rejects malformed responses', () => {
    expect(parsePreview(preview)).toEqual(preview);
    expect(
      parsePreview({ ...preview, complete: false, media: [{ id: 4, file: null, alt: '' }] })
        .media[0]?.file,
    ).toBeNull();
    for (const value of [
      null,
      [],
      { ...preview, token: '../x' },
      { ...preview, complete: 1 },
      { ...preview, title: 1 },
      { ...preview, media: {} },
      { ...preview, media: [{ id: -1, file: null, alt: '' }] },
    ]) {
      expect(() => parsePreview(value)).toThrow(ApiError);
    }
  });

  it('sends multipart with nonce and cookies without overriding its boundary', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(preview), { status: 200 }),
    );
    const api = packagesApi(
      new ApiClient({ restRoot: 'http://localhost/api', nonce: 'nonce', fetchImpl }),
    );
    const archive = new File(['PK'], 'slider.zip', { type: 'application/zip' });
    expect(await api.preview(archive)).toEqual(preview);
    const options = fetchImpl.mock.calls[0]?.[1];
    expect(options?.body).toBeInstanceOf(FormData);
    expect(options?.headers).toEqual({ Accept: 'application/json', 'X-WP-Nonce': 'nonce' });
    expect(options?.credentials).toBe('same-origin');
  });

  it('uses explicit confirm and cancel mutations and validates returned identities', async () => {
    const client = fake();
    vi.mocked(client.post)
      .mockResolvedValueOnce({ state: 'queued', id: null, done: 0, total: 0 })
      .mockResolvedValueOnce({ state: 'completed', id: 11, done: 3, total: 3 })
      .mockResolvedValueOnce({ cancelled: true })
      .mockResolvedValueOnce({ id: 0 });
    const api = packagesApi(client);
    expect(await api.commit(token, { '4': 7 }, { source: 'local' })).toBe(11);
    expect(client.post).toHaveBeenCalledWith('packages/commit', {
      token,
      media: { '4': 7 },
      fonts: { source: 'local' },
    });
    await api.cancel(token);
    await expect(api.commit(token, {}, {})).rejects.toThrow(ApiError);
  });

  it('downloads only from the same origin and marks file-free exports explicitly', async () => {
    const client = fake();
    vi.mocked(client.post)
      .mockResolvedValueOnce({ url: `${window.location.origin}/download` })
      .mockResolvedValueOnce({ url: 'https://foreign.test/archive' });
    const api = packagesApi(client);
    expect(await api.export(4, false)).toBe(`${window.location.origin}/download`);
    expect(client.post).toHaveBeenCalledWith(
      'packages/export',
      { id: 4, includeFiles: false },
      { timeoutMs: 180000 },
    );
    await expect(api.export(4, true)).rejects.toThrow(ApiError);
  });

  it('lists versioned local templates and only instantiates known ones', async () => {
    const client = fake();
    vi.mocked(client.get).mockResolvedValue([{ id: 'event', name: 'Event', version: 1 }]);
    vi.mocked(client.post).mockResolvedValue({ id: 8 });
    const api = packagesApi(client);
    expect(await api.templates()).toEqual([{ id: 'event', name: 'Event', version: 1 }]);
    expect(await api.fromTemplate('event')).toBe(8);
    await expect(api.fromTemplate('../evil')).rejects.toThrow(ApiError);
    expect(client.post).toHaveBeenCalledTimes(1);
  });
});
