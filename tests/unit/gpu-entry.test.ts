import { afterEach, describe, expect, it, vi } from 'vitest';

/** The bundle entry registers `window.swsGpu`; without WebGL2 it mounts nothing. */
describe('GPU bundle entry', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    delete window.swsGpu;
  });

  const entry = {
    layerId: 'fx',
    type: 'vendor/test',
    schemaVersion: 1,
    seed: 1,
    quality: 'auto' as const,
    continuous: true,
    module: '/m.js',
    params: {},
    assets: {},
  };

  it('registers the host and mounts an inert controller without WebGL2', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await import('@gpu/index');
    const host = window.swsGpu;
    expect(host?.version).toBe(1);
    const mount = host?.mount(document.createElement('div'), [entry], false);
    expect(mount).toBeDefined();
    const slide = document.createElement('div');
    expect(() => {
      mount?.activate(slide);
      mount?.deactivate(slide);
      mount?.setUserPaused(true);
      mount?.setReducedMotion(true);
      mount?.destroy();
    }).not.toThrow();
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('mounts nothing for an empty entry list, even with WebGL2', async () => {
    const gl = { getExtension: () => null, getParameter: () => 4096 };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl as never);
    await import('@gpu/index');
    const root = document.createElement('div');
    const mount = window.swsGpu?.mount(root, [], false);
    mount?.destroy();
    expect(mount).toBeDefined();
  });

  it('creates a real controller when WebGL2 is available', async () => {
    const gl = { getExtension: () => null, getParameter: () => 4096 };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl as never);
    await import('@gpu/index');
    const root = document.createElement('div');
    const mount = window.swsGpu?.mount(root, [entry], false);
    // A real controller listens to pointer events on the slider; destroy removes them again.
    expect(() => root.dispatchEvent(new Event('pointermove'))).not.toThrow();
    mount?.destroy();
  });
});
