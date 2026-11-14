import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startUpdateChecks } from '../../assets/updates/updates';

describe('verified update checks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<button id="sws-verified-updates-check">Check</button><p id="sws-verified-updates-result" hidden></p><a id="sws-verified-updates-reload" href="/wp-admin/plugins.php" hidden>Reload</a><span id="sws-verified-updates-status">Cached</span>';
    window.swsVerifiedUpdates = {
      url: '/wp-admin/admin-ajax.php',
      nonce: 'local',
      due: false,
      ready: true,
      checking: 'Checking',
      completed: 'Done',
      failed: 'Failed',
    };
  });
  afterEach(() => {
    delete window.swsVerifiedUpdates;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  const click = () => document.getElementById('sws-verified-updates-check')?.click();
  const result = () => document.getElementById('sws-verified-updates-result');
  it('does nothing without backend configuration', () => {
    delete window.swsVerifiedUpdates;
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    startUpdateChecks();
    click();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('sends one manual request with nonce, credentials and no install action', async () => {
    let resolve: (value: Response) => void = () => {};
    const fetcher = vi.fn(
      (_url: string, _options: RequestInit) =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    startUpdateChecks();
    click();
    click();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result()?.textContent).toBe('Checking');
    expect(result()?.hidden).toBe(false);
    expect(fetcher.mock.calls[0]?.[1].credentials).toBe('same-origin');
    expect(String(fetcher.mock.calls[0]?.[1].body)).toBe(
      'action=sws_check_github_updates&nonce=local&manual=1',
    );
    resolve({
      ok: true,
      json: async () => ({ success: true, data: { message: 'Verified' } }),
    } as Response);
    await vi.runAllTimersAsync();
    expect(result()?.textContent).toBe('Verified');
    expect(document.getElementById('sws-verified-updates-reload')?.hidden).toBe(false);
    expect(document.getElementById('sws-verified-updates-status')?.hidden).toBe(true);
    expect(
      (document.getElementById('sws-verified-updates-check') as HTMLButtonElement).disabled,
    ).toBe(false);
  });
  it.each([false, true])(
    'reports network/HTTP errors and re-enables controls (%s)',
    async (reject) => {
      vi.stubGlobal(
        'fetch',
        reject
          ? vi.fn().mockRejectedValue(new Error())
          : vi.fn().mockResolvedValue({
              ok: false,
              json: async () => {
                throw new SyntaxError();
              },
            }),
      );
      startUpdateChecks();
      click();
      await vi.runAllTimersAsync();
      expect(result()?.textContent).toBe('Failed');
      expect(
        (document.getElementById('sws-verified-updates-check') as HTMLButtonElement).disabled,
      ).toBe(false);
    },
  );
  it('defers overdue checks until load and idle, keeps background results quiet', async () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const idle = vi.fn((callback: IdleRequestCallback) => {
      callback({} as IdleDeadline);
      return 1;
    });
    vi.stubGlobal('requestIdleCallback', idle);
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetcher);
    if (window.swsVerifiedUpdates) window.swsVerifiedUpdates.due = true;
    startUpdateChecks();
    expect(fetcher).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));
    await vi.runAllTimersAsync();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[1].body)).toContain('manual=0');
    expect(result()?.hidden).toBe(true);
  });
  it('uses a timer after completed load without idle API, tolerates missing UI', async () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    Reflect.deleteProperty(window, 'requestIdleCallback');
    document.body.innerHTML = '';
    if (window.swsVerifiedUpdates) window.swsVerifiedUpdates.due = true;
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetcher);
    startUpdateChecks();
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('aborts a hanging request and uses fallback completion text', async () => {
    const fetcher = vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) =>
          options.signal?.addEventListener('abort', () => reject(new Error())),
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    startUpdateChecks();
    click();
    await vi.advanceTimersByTimeAsync(90000);
    expect(result()?.textContent).toBe('Failed');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }),
    );
    click();
    await vi.runAllTimersAsync();
    expect(result()?.textContent).toBe('Done');
  });
  it('keeps unconfigured rows disabled without a request', async () => {
    if (window.swsVerifiedUpdates) {
      window.swsVerifiedUpdates.ready = false;
      window.swsVerifiedUpdates.due = true;
    }
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const button = document.getElementById('sws-verified-updates-check') as HTMLButtonElement;
    button.disabled = true;
    startUpdateChecks();
    click();
    await vi.runAllTimersAsync();
    expect(fetcher).not.toHaveBeenCalled();
    expect(button.disabled).toBe(true);
  });
  it('shows backend throttle/errors without suggesting a reload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: false, data: { message: 'Wait 60 seconds' } }),
      }),
    );
    startUpdateChecks();
    click();
    await vi.runAllTimersAsync();
    expect(result()?.textContent).toBe('Wait 60 seconds');
    expect(document.getElementById('sws-verified-updates-reload')?.hidden).toBe(true);
  });
});
