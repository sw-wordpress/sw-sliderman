import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedFontWait } from '../../assets/browser/fonts';
import { parseInstallation } from '../../assets/editor/api/fonts';

afterEach(() => {
  vi.useRealTimers();
});
describe('local font readiness', () => {
  it('releases the editor after a slow font deadline', async () => {
    vi.useFakeTimers();
    const wait = boundedFontWait(new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(1200);
    expect(await wait).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('resolves failures and cancellation without unhandled rejections or timers', async () => {
    vi.useFakeTimers();
    expect(await boundedFontWait(Promise.reject(new Error('font missing')))).toBe(false);
    const controller = new AbortController();
    const wait = boundedFontWait(new Promise(() => {}), controller.signal);
    controller.abort();
    expect(await wait).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('accepts success without waiting for the fallback deadline', async () => {
    expect(await boundedFontWait(Promise.resolve(true))).toBe(true);
  });
  it('never accepts foreign font stylesheet URLs from an API response', () => {
    const item = {
      id: 'font',
      familyId: 'family',
      family: 'Family',
      category: 'sans-serif',
      variants: [{ weight: 400, style: 'normal', subsets: ['latin'] }],
      stylesheetUrl: 'https://fonts.googleapis.com/css2?family=Lato',
      licenseId: 'OFL',
      licenseUrl: 'https://foreign.test/license',
      installedGmt: '',
      filesPresent: true,
      inUse: false,
    };
    const parsed = parseInstallation(item);
    expect(parsed.stylesheetUrl).toBeNull();
    expect(parsed.licenseUrl).toBeNull();
  });
});
