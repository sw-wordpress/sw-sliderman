import type { EffectEntry } from '../browser/gpuHost';
import { EffectRegistry } from './core/registry';
import type { EffectEvent } from './core/types';
import { GpuDevice } from './device/webgl2';
import { gpuApi, type EffectModuleFactory } from './stage/api';
import { Scheduler } from './stage/scheduler';
import { EffectStage, type PauseReason, type StageState } from './stage/stage';
import { EffectUnavailableError } from './core/errors';
import { detectCapabilities } from './device/capabilities';

/**
 * Live preview of one effect inside the editor (loaded lazily as its own editor chunk). It uses the
 * same stage as the frontend, so what the editor shows is what the page runs.
 */
export type PreviewEntry = Omit<EffectEntry, 'layerId' | 'continuous'>;

export interface Preview {
  readonly state: StageState;
  /** Applies edited parameters, seed or quality while running. */
  reconfigure(patch: {
    params?: Record<string, unknown>;
    seed?: number;
    quality?: EffectEntry['quality'];
  }): Promise<void>;
  event(event: EffectEvent): void;
  setPaused(reason: PauseReason, paused: boolean): void;
  setPointer(point: { x: number; y: number; down: boolean } | null): void;
  dispose(): void;
}

const registry = new EffectRegistry<GpuDevice>();
const scheduler = new Scheduler();
let supported: boolean | null = null;

/** Whether this browser can run GPU effects at all (WebGL2). */
export function gpuAvailable(): boolean {
  supported ??= detectCapabilities().backend === 'webgl2';
  return supported;
}

export function createPreview(
  host: HTMLElement,
  entry: PreviewEntry,
  reducedMotion: () => boolean,
  onState?: (state: StageState) => void,
): Preview {
  if (!registry.has(entry.type)) {
    registry.registerLoader(entry.type, async () => {
      const loaded = (await import(/* @vite-ignore */ entry.module)) as { default?: unknown };
      if (typeof loaded.default !== 'function')
        throw new EffectUnavailableError(entry.type, 'invalid_module');
      return (loaded.default as EffectModuleFactory)(gpuApi);
    });
  }
  const stage = new EffectStage({
    host,
    config: {
      type: entry.type,
      schemaVersion: entry.schemaVersion,
      seed: entry.seed,
      quality: entry.quality,
      params: { ...entry.params },
    },
    assets: entry.assets,
    registry,
    scheduler,
    createDevice: (canvas) => GpuDevice.create(canvas),
    reducedMotion,
    ...(onState ? { onState } : {}),
  });
  if (gpuAvailable()) void stage.start();
  return {
    get state() {
      return stage.state;
    },
    // Without WebGL2 nothing runs, so a restart (new seed or quality) must not try to start it either.
    reconfigure: (patch) => (gpuAvailable() ? stage.reconfigure(patch) : Promise.resolve()),
    event: (event) => stage.sendEvent(event),
    setPaused: (reason, paused) => stage.setPaused(reason, paused),
    setPointer: (point) => stage.setPointer(point),
    dispose: () => stage.dispose(),
  };
}
