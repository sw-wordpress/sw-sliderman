import type { EffectEntry, GpuMount } from '../../browser/gpuHost';
import { EffectUnavailableError } from '../core/errors';
import type { EffectRegistry } from '../core/registry';
import type { GpuDevice } from '../device/webgl2';
import { gpuApi, type EffectModuleFactory, type GpuApi } from './api';
import type { Scheduler } from './scheduler';
import { EffectStage, type StageState } from './stage';

export interface ControllerDeps {
  readonly registry: EffectRegistry<GpuDevice>;
  readonly scheduler: Scheduler;
  readonly createDevice: (canvas: HTMLCanvasElement) => GpuDevice | null;
  readonly api?: GpuApi;
  /** Loads a module file; replaceable in tests. */
  readonly importModule?: (url: string) => Promise<{ default?: unknown }>;
  /** Idle time after which a left slide gives its GPU resources back. */
  readonly idleReleaseMs?: number;
  readonly onState?: (layerId: string, state: StageState) => void;
}

const browserImport = (url: string): Promise<{ default?: unknown }> =>
  import(/* @vite-ignore */ url) as Promise<{ default?: unknown }>;

/**
 * All effect stages of one slider. A stage exists (and uses the GPU) only for the visible slide;
 * a left slide pauses at once and releases its resources after an idle period.
 */
export class EffectController implements GpuMount {
  private readonly stages = new Map<string, EffectStage>();
  private readonly entries = new Map<string, EffectEntry>();
  private readonly idle = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly cleanups: Array<() => void> = [];
  private userPaused = false;
  private reduced: boolean;
  private destroyed = false;
  private readonly active = new Set<HTMLElement>();

  constructor(
    private readonly root: HTMLElement,
    entries: readonly EffectEntry[],
    reducedMotion: boolean,
    private readonly deps: ControllerDeps,
  ) {
    this.reduced = reducedMotion;
    for (const entry of entries) {
      this.entries.set(entry.layerId, entry);
      this.registerLoader(entry);
    }
    const onVisibility = (): void =>
      this.forEach((stage) => stage.setPaused('document', document.hidden));
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));
    this.bindPointer();
  }

  activate(slide: HTMLElement): void {
    if (this.destroyed) return;
    this.active.add(slide);
    for (const entry of this.entries.values()) {
      const host = this.hostIn(slide, entry.layerId);
      if (!host) continue;
      this.cancelIdle(entry.layerId);
      let stage = this.stages.get(entry.layerId);
      if (!stage) {
        stage = this.createStage(host, entry);
        this.stages.set(entry.layerId, stage);
      }
      stage.setPaused('slide', false);
      stage.setPaused('user', this.userPaused);
      stage.setPaused('document', document.hidden);
      void stage.start();
    }
  }

  deactivate(slide: HTMLElement): void {
    this.active.delete(slide);
    for (const entry of this.entries.values()) {
      if (!this.hostIn(slide, entry.layerId)) continue;
      const stage = this.stages.get(entry.layerId);
      if (!stage) continue;
      stage.setPaused('slide', true);
      this.scheduleIdleRelease(entry.layerId, stage);
    }
  }

  setUserPaused(paused: boolean): void {
    this.userPaused = paused;
    this.forEach((stage) => stage.setPaused('user', paused));
  }

  setReducedMotion(reduced: boolean): void {
    if (this.reduced === reduced) return;
    this.reduced = reduced;
    if (reduced) {
      this.forEach((stage) => stage.release());
    } else {
      for (const slide of this.active) this.activate(slide);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const timer of this.idle.values()) clearTimeout(timer);
    this.idle.clear();
    this.forEach((stage) => stage.dispose());
    this.stages.clear();
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
  }

  // -------------------------------------------------------------------------------------------

  private forEach(visit: (stage: EffectStage) => void): void {
    for (const stage of this.stages.values()) visit(stage);
  }

  private hostIn(slide: HTMLElement, layerId: string): HTMLElement | null {
    return slide.querySelector<HTMLElement>(`[data-sws-layer="${CSS.escape(layerId)}"] .sws-fx`);
  }

  private createStage(host: HTMLElement, entry: EffectEntry): EffectStage {
    return new EffectStage({
      host,
      config: {
        type: entry.type,
        schemaVersion: entry.schemaVersion,
        seed: entry.seed,
        quality: entry.quality,
        params: { ...entry.params },
      },
      assets: entry.assets,
      registry: this.deps.registry,
      scheduler: this.deps.scheduler,
      createDevice: this.deps.createDevice,
      reducedMotion: () => this.reduced,
      onState: (state) => this.deps.onState?.(entry.layerId, state),
    });
  }

  private registerLoader(entry: EffectEntry): void {
    const { registry } = this.deps;
    if (registry.has(entry.type)) return;
    const load = this.deps.importModule ?? browserImport;
    const api = this.deps.api ?? gpuApi;
    registry.registerLoader(entry.type, async () => {
      const loaded = await load(entry.module);
      if (typeof loaded.default !== 'function')
        throw new EffectUnavailableError(entry.type, 'invalid_module');
      return (loaded.default as EffectModuleFactory)(api);
    });
  }

  private scheduleIdleRelease(layerId: string, stage: EffectStage): void {
    this.cancelIdle(layerId);
    const delay = this.deps.idleReleaseMs ?? 10000;
    this.idle.set(
      layerId,
      setTimeout(() => {
        this.idle.delete(layerId);
        stage.release();
      }, delay),
    );
  }

  private cancelIdle(layerId: string): void {
    const timer = this.idle.get(layerId);
    if (timer !== undefined) clearTimeout(timer);
    this.idle.delete(layerId);
  }

  /** Passive pointer tracking on the slider; canvases never take pointer events themselves. */
  private bindPointer(): void {
    const send = (event: PointerEvent, down: boolean): void => {
      const point = { x: event.clientX, y: event.clientY, down };
      this.forEach((stage) => stage.setPointer(point));
    };
    const move = (event: Event): void =>
      send(event as PointerEvent, (event as PointerEvent).buttons > 0);
    const leave = (): void => this.forEach((stage) => stage.setPointer(null));
    const options: AddEventListenerOptions = { passive: true };
    for (const type of ['pointermove', 'pointerdown', 'pointerup'])
      this.root.addEventListener(type, move, options);
    for (const type of ['pointerleave', 'pointercancel'])
      this.root.addEventListener(type, leave, options);
    this.cleanups.push(() => {
      for (const type of ['pointermove', 'pointerdown', 'pointerup'])
        this.root.removeEventListener(type, move);
      for (const type of ['pointerleave', 'pointercancel'])
        this.root.removeEventListener(type, leave);
    });
  }
}
