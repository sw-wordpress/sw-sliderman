import { afterEach, describe, expect, it, vi } from 'vitest';

/** The editor's preview API on top of the real stage (no WebGL in jsdom: the fallback paths). */
const capabilities = vi.hoisted(() => ({ backend: 'none' as 'none' | 'webgl2' }));
vi.mock('@gpu/device/capabilities', () => ({
  detectCapabilities: () => ({
    backend: capabilities.backend,
    webgl2: capabilities.backend === 'webgl2',
    floatTargets: false,
    maxTextureSize: 0,
    webgpu: false,
  }),
}));

const entry = {
  type: 'vendor/preview-test',
  schemaVersion: 1,
  seed: 1,
  quality: 'auto' as const,
  module: '/missing.js?ver=1',
  params: {},
  assets: {},
};

describe('createPreview', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('stays idle without WebGL2 and tolerates every call', async () => {
    capabilities.backend = 'none';
    const { createPreview, gpuAvailable } = await import('@gpu/preview');
    expect(gpuAvailable()).toBe(false);
    const states: string[] = [];
    const preview = createPreview(
      document.createElement('div'),
      entry,
      () => false,
      (s) => states.push(s),
    );
    expect(preview.state).toBe('idle');
    await preview.reconfigure({ params: {}, seed: 2 });
    preview.event({ type: 'burst' });
    preview.setPaused('user', true);
    preview.setPointer({ x: 1, y: 2, down: false });
    preview.dispose();
    expect(preview.state).toBe('disposed');
    expect(states).toEqual(['disposed']);
  });

  it('falls back when the device or the module is unavailable', async () => {
    capabilities.backend = 'webgl2';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { createPreview, gpuAvailable } = await import('@gpu/preview');
    expect(gpuAvailable()).toBe(true);
    const host = document.createElement('div');
    const preview = createPreview(host, entry, () => false);
    await vi.waitFor(() => expect(preview.state).toBe('fallback'));
    expect(host.querySelector('canvas')).toBeNull();
    // The same type is registered once; another preview of it reuses the loader.
    const second = createPreview(document.createElement('div'), entry, () => false);
    await vi.waitFor(() => expect(second.state).toBe('fallback'));
    preview.dispose();
    second.dispose();
  });

  it('shows the static image for reduced motion without touching the GPU', async () => {
    capabilities.backend = 'webgl2';
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const { createPreview } = await import('@gpu/preview');
    const preview = createPreview(document.createElement('div'), entry, () => true);
    await vi.waitFor(() => expect(preview.state).toBe('fallback'));
    expect(context).not.toHaveBeenCalled();
    preview.dispose();
  });
});
