import type { EffectEntry, GpuHost, GpuMount } from '../browser/gpuHost';
import { EffectRegistry } from './core/registry';
import { detectCapabilities } from './device/capabilities';
import { GpuDevice } from './device/webgl2';
import { GPU_API_VERSION } from './stage/api';
import { EffectController } from './stage/controller';
import { Scheduler } from './stage/scheduler';

/**
 * Entry of the optional GPU bundle (`build/gpu/gpu.js`, classic script). It registers `window.swsGpu`
 * for the frontend runtime and loads effect modules on demand from the URLs in the slider config.
 * Without WebGL2 the host mounts nothing and every effect layer keeps its static fallback.
 */
const registry = new EffectRegistry<GpuDevice>();
const scheduler = new Scheduler();
let supported: boolean | null = null;

const inactive: GpuMount = {
  activate() {},
  deactivate() {},
  setUserPaused() {},
  setReducedMotion() {},
  destroy() {},
};

const host: GpuHost = {
  version: GPU_API_VERSION,
  mount(root: HTMLElement, entries: readonly EffectEntry[], reducedMotion: boolean): GpuMount {
    supported ??= detectCapabilities().backend === 'webgl2';
    if (!supported || entries.length === 0) return inactive;
    return new EffectController(root, entries, reducedMotion, {
      registry,
      scheduler,
      createDevice: (canvas) => GpuDevice.create(canvas),
    });
  },
};

window.swsGpu = host;
