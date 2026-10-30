import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, isApiError, normaliseError } from '@editor/api/client';
import { fontsApi } from '@editor/api/fonts';
import { slidersApi } from '@editor/api/sliders';
import { Recovery, parseEntry } from '@editor/document/recovery';
import { validateDocument } from '@shared/validate';
import { fixture } from './fixtures';

const result = validateDocument(fixture('documents/valid/basic.json'));
if (!result.ok) throw new Error('Invalid fixture');
const document = result.document;
const installation = {
  id: 'lato-123',
  familyId: 'lato',
  family: 'Lato',
  category: 'sans-serif',
  variants: [{ weight: 400, style: 'normal', subsets: ['latin'] }],
  stylesheetUrl: '/font.css',
  licenseId: 'OFL',
  licenseUrl: '/LICENSE.txt',
  installedGmt: '',
  filesPresent: true,
  originMismatch: false,
  inUse: false,
};
const queued = {
  id: 'job-1',
  kind: 'install',
  familyId: 'lato',
  state: 'queued',
  updatedGmt: '',
  result: null,
  error: null,
};
const response = (data: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers });

describe('font and slider HTTP contracts', () => {
  it('manages a job through queue, run, cancel and retry with the same typed transport', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(queued));
    const client = new ApiClient({
      restRoot: 'http://localhost/api',
      nonce: 'nonce',
      fetchImpl: fetcher,
    });
    const fonts = fontsApi(client);
    expect(
      (
        await fonts.createJob('install', {
          familyId: 'lato',
          variants: [{ weight: 400, style: 'normal' }],
          subsets: ['latin'],
        })
      ).state,
    ).toBe('queued');
    fetcher.mockResolvedValue(response({ ...queued, state: 'completed', result: installation.id }));
    expect((await fonts.runJob(queued.id)).result).toBe(installation.id);
    fetcher.mockResolvedValue(response({ ...queued, state: 'cancelled' }));
    expect((await fonts.cancelJob(queued.id)).state).toBe('cancelled');
    fetcher.mockResolvedValue(response({ ...queued, id: 'job-2' }));
    expect((await fonts.retryJob(queued.id)).id).toBe('job-2');
    fetcher.mockResolvedValue(response([queued]));
    expect(await fonts.jobs()).toHaveLength(1);
    fetcher.mockResolvedValue(response([installation]));
    expect((await fonts.installations())[0]?.filesPresent).toBe(true);
    fetcher.mockImplementation(async () => response(installation));
    expect((await fonts.install('lato', [{ weight: 400, style: 'normal' }], ['latin'])).id).toBe(
      installation.id,
    );
    await fonts.setOffline(true);
    await fonts.importFile(
      {
        family: 'Local',
        weight: 400,
        style: 'normal',
        subset: 'latin',
        licenseId: 'OFL',
        licenseText: 'license text',
      },
      'd09GMg==',
    );
    await fonts.uninstall(installation.id);
    expect(
      fetcher.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith('/fonts/import') && String(init?.body).includes('fileBase64'),
      ),
    ).toBe(true);
  });
  it('rejects invalid jobs and catalog responses instead of trusting server shapes', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => response([{ ...queued, state: 'unknown' }]));
    const fonts = fontsApi(
      new ApiClient({ restRoot: 'http://localhost/api/', nonce: '', fetchImpl: fetcher }),
    );
    await expect(fonts.jobs()).rejects.toMatchObject({ code: 'sws_invalid_response' });
    fetcher.mockImplementation(async () => response({ catalogVersion: 'test', families: null }));
    await expect(fonts.catalog()).rejects.toMatchObject({ code: 'sws_invalid_response' });
  });
  it('retains conflicts and validation issues, and validates revision ownership responses', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      response(
        {
          code: 'sws_revision_conflict',
          message: 'Conflict',
          data: { status: 409, currentVersion: 8 },
        },
        409,
      ),
    );
    const sliders = slidersApi(
      new ApiClient({ restRoot: 'http://localhost/api/', nonce: '', fetchImpl: fetcher }),
    );
    expect(await sliders.save(7, 'T', document, 1)).toEqual({
      status: 'conflict',
      currentVersion: 8,
    });
    fetcher.mockImplementation(async () =>
      response(
        {
          code: 'sws_invalid_document',
          message: 'Invalid',
          data: { issues: [{ path: 'fontRefs', code: 'missing_resource' }] },
        },
        422,
      ),
    );
    expect((await sliders.save(7, 'T', document, 1)).status).toBe('invalid');
    fetcher.mockImplementation(async () =>
      response([{ id: 4, title: 'Revision', modifiedGmt: '', autosave: true }]),
    );
    expect((await sliders.revisions(7))[0]?.autosave).toBe(true);
    fetcher.mockImplementation(async () => response({ version: 2, publishedGmt: 'now' }));
    await sliders.restore(7, 4, 1);
    await sliders.trash(7);
    expect((await sliders.publish(7, 2)).version).toBe(2);
  });
  it('refreshes nonce headers, normalizes errors and rejects malformed JSON', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => response({}, 200, { 'X-WP-Nonce': 'renewed' }))
      .mockImplementationOnce(async () => new Response('<html>', { status: 200 }));
    const client = new ApiClient({
      restRoot: 'http://localhost/api/',
      nonce: 'old',
      fetchImpl: fetcher,
    });
    await client.get('/test', { empty: '', enabled: false, absent: null });
    await expect(client.get('next')).rejects.toMatchObject({ code: 'sws_invalid_response' });
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({ 'X-WP-Nonce': 'renewed' });
    fetcher.mockRejectedValue(new Error('network'));
    await expect(client.get('next')).rejects.toMatchObject({ code: 'sws_network' });
    expect(isApiError(normaliseError(503, null))).toBe(true);
    expect(new ApiError('sws_aborted', '', 0).isAborted).toBe(true);
  });
});

describe('local recovery isolation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  it('keeps tab copies separate, finds newest valid copy and clears only its own scope', () => {
    window.sessionStorage.setItem('sws-tab', 'one');
    const one = new Recovery('site:user', 7);
    one.write('First', document, 1);
    window.sessionStorage.setItem('sws-tab', 'two');
    const two = new Recovery('site:user', 7);
    two.write('Second', document, 2);
    expect(two.newest()?.baseVersion).toBeGreaterThan(0);
    expect(window.localStorage.length).toBe(2);
    two.clear();
    expect(one.newest()?.title).toBe('First');
    const other = new Recovery('different:user', 7);
    other.write('Other', document, 1);
    one.discardAll();
    expect(one.newest()).toBeNull();
    expect(other.newest()?.title).toBe('Other');
  });
  it('rejects malformed/untrusted storage and tolerates unavailable storage', () => {
    for (const raw of [
      null,
      '{',
      'null',
      '{}',
      JSON.stringify({ title: 'T', document, baseVersion: 'wrong' }),
    ])
      expect(parseEntry(raw)).toBeNull();
    const recovery = new Recovery('site:user', 7);
    recovery.write('T', document, 3);
    expect(recovery.newest()?.document.id).toBe(document.id);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => recovery.write('T', document, 3)).not.toThrow();
    spy.mockRestore();
  });
});
