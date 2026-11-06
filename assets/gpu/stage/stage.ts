import { AdaptiveQuality, QUALITY_PROFILES, resolveTier } from '../core/quality';
import { FixedStepper } from '../core/timestep';
import type { EffectRegistry } from '../core/registry';
import type {
  EffectConfig,
  EffectEvent,
  EffectInstance,
  PointerSample,
  QualityTier,
} from '../core/index';
import type { GpuDevice } from '../device/webgl2';
import type { Scheduler } from './scheduler';

/** Why a stage is not animating. Several reasons can apply at once. */
export type PauseReason = 'user' | 'document' | 'offscreen' | 'slide';

export type StageState =
  'idle' | 'loading' | 'running' | 'paused' | 'lost' | 'fallback' | 'disposed';

export interface StageAssets {
  readonly [key: string]: { readonly url: string; readonly width: number; readonly height: number };
}

export interface StageOptions {
  readonly host: HTMLElement;
  readonly config: EffectConfig;
  readonly assets: StageAssets;
  readonly registry: EffectRegistry<GpuDevice>;
  readonly scheduler: Scheduler;
  readonly createDevice: (canvas: HTMLCanvasElement) => GpuDevice | null;
  readonly reducedMotion: () => boolean;
  /** Milliseconds clock; defaults to `performance.now`. */
  readonly now?: () => number;
  readonly onState?: (state: StageState) => void;
}

const MAX_RESTORE_ATTEMPTS = 2;

/**
 * One effect layer: canvas, device, effect instance, frame loop and pause logic. Everything that can
 * go wrong ends in the static fallback (`state === 'fallback'`) instead of an error.
 */
export class EffectStage {
  private stateValue: StageState = 'idle';
  private readonly reasons = new Set<PauseReason>();
  private canvas: HTMLCanvasElement | null = null;
  private device: GpuDevice | null = null;
  private instance: EffectInstance | null = null;
  private removeTask: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private intersection: IntersectionObserver | null = null;
  private offContext: (() => void) | null = null;
  private readonly stepper = new FixedStepper();
  private pendingSteps = 0;
  private readonly adaptive = new AdaptiveQuality({ start: 'high' });
  private tier: QualityTier;
  private lastTime: number | null = null;
  private time = 0;
  private cssWidth = 0;
  private cssHeight = 0;
  private pointer: { x: number; y: number; down: boolean; px: number; py: number } | null = null;
  private pixelRatio = 1;
  private restoreAttempts = 0;
  private generation = 0;

  /** Current configuration; `reconfigure` replaces parts of it. */
  private config: EffectConfig;

  constructor(private readonly options: StageOptions) {
    this.config = options.config;
    this.tier = resolveTier(options.config.quality ?? 'auto', 'high');
  }

  get state(): StageState {
    return this.stateValue;
  }

  get paused(): boolean {
    return this.reasons.size > 0;
  }

  /** Start (or restart) the effect: device, instance, observers. Safe to call repeatedly. */
  async start(): Promise<void> {
    if (this.stateValue === 'disposed' || this.instance || this.stateValue === 'loading') return;
    if (this.options.reducedMotion()) return this.fallback();
    this.setState('loading');
    const generation = ++this.generation;
    const canvas = this.createCanvas();
    const device = this.options.createDevice(canvas);
    if (!device) {
      canvas.remove();
      return this.fallback();
    }
    this.canvas = canvas;
    this.device = device;
    this.offContext = device.onContext({
      lost: () => this.onLost(),
      restored: () => void this.onRestored(),
    });
    this.observe();
    const ok = await this.createInstance(generation);
    if (!ok) return;
    this.updateRunning();
  }

  setPaused(reason: PauseReason, on: boolean): void {
    if (on) this.reasons.add(reason);
    else this.reasons.delete(reason);
    this.updateRunning();
  }

  /**
   * Applies edited settings while running (editor preview). Parameters are validated again and handed
   * to the instance; a new seed or quality restarts the effect.
   */
  async reconfigure(patch: {
    params?: Record<string, unknown>;
    seed?: number;
    quality?: EffectConfig['quality'];
  }): Promise<void> {
    if (this.stateValue === 'disposed') return;
    const restart =
      (patch.seed !== undefined && patch.seed !== this.config.seed) ||
      (patch.quality !== undefined && patch.quality !== this.config.quality);
    this.config = {
      ...this.config,
      ...(patch.params === undefined ? {} : { params: patch.params }),
      ...(patch.seed === undefined ? {} : { seed: patch.seed }),
      ...(patch.quality === undefined ? {} : { quality: patch.quality }),
    };
    if (patch.quality !== undefined) this.tier = resolveTier(patch.quality, this.tier);
    if (restart) {
      this.release();
      return this.start();
    }
    if (patch.params === undefined || !this.instance) return;
    const generation = this.generation;
    try {
      const resolved = await this.options.registry.resolveParams(this.config);
      if (generation === this.generation && this.instance) this.instance.setParams(resolved.params);
    } catch (error) {
      // An invalid intermediate edit keeps the last valid look; the editor shows the validation issue.
      console.warn('sw-sliderman: effect parameters rejected', error);
    }
  }

  /** Sends an event (impulse, reset) to the running effect. */
  sendEvent(event: EffectEvent): void {
    this.instance?.handleEvent(event);
  }

  /** Latest pointer position in client (viewport) coordinates, or null when it left. */
  setPointer(client: { x: number; y: number; down: boolean } | null): void {
    if (!client) {
      this.pointer = null;
      return;
    }
    const previous = this.pointer;
    this.pointer = { ...client, px: previous?.x ?? client.x, py: previous?.y ?? client.y };
  }

  /** Releases everything and shows the static fallback again. */
  dispose(): void {
    if (this.stateValue === 'disposed') return;
    this.generation++;
    this.teardown();
    this.options.host.classList.remove('sws-fx--live');
    this.setState('disposed');
  }

  /** Releases the GPU (instance, device, canvas) but allows `start()` again. */
  release(): void {
    if (this.stateValue === 'disposed') return;
    this.generation++;
    this.teardown();
    this.options.host.classList.remove('sws-fx--live');
    this.setState('idle');
  }

  // -------------------------------------------------------------------------------------------

  private setState(state: StageState): void {
    if (this.stateValue === state) return;
    this.stateValue = state;
    this.options.host.dataset.swsFxState = state;
    this.options.onState?.(state);
  }

  private fallback(): void {
    this.teardown();
    this.options.host.classList.remove('sws-fx--live');
    this.setState('fallback');
  }

  private createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.tabIndex = -1;
    canvas.className = 'sws-fx__canvas';
    this.options.host.append(canvas);
    return canvas;
  }

  private async createInstance(generation: number): Promise<boolean> {
    const { registry, assets } = this.options;
    const config = this.config;
    const device = this.device;
    if (!device) return false;
    try {
      const rect = this.options.host.getBoundingClientRect();
      this.applySize(rect.width, rect.height);
      const resolved = await registry.resolveParams(config);
      if (generation !== this.generation || !this.device) return false;
      const instance = await resolved.module.create(
        {
          device,
          backend: 'webgl2',
          seed: config.seed ?? 0,
          quality: this.tier,
          reducedMotion: false,
          assets: { url: (key) => assets[key]?.url ?? null },
          viewport: { width: this.cssWidth, height: this.cssHeight, pixelRatio: this.pixelRatio },
        },
        resolved.params,
      );
      if (generation !== this.generation || !this.device) {
        instance.dispose();
        return false;
      }
      this.instance = instance;
      instance.resize({
        width: this.cssWidth,
        height: this.cssHeight,
        pixelRatio: this.pixelRatio,
      });
      // Parameters edited while the instance was loading are applied now.
      if (this.config.params !== config.params) {
        const latest = await registry.resolveParams(this.config);
        if (generation === this.generation && this.instance === instance)
          instance.setParams(latest.params);
      }
      return true;
    } catch (error) {
      console.warn('sw-sliderman: effect unavailable, showing the static fallback', error);
      if (generation === this.generation) this.fallback();
      return false;
    }
  }

  private observe(): void {
    const host = this.options.host;
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        const box = entries[entries.length - 1]?.contentRect;
        if (box) this.applySize(box.width, box.height);
      });
      this.resizeObserver.observe(host);
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this.intersection = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) this.setPaused('offscreen', !last.isIntersecting);
      });
      this.intersection.observe(host);
    }
  }

  private applySize(width: number, height: number): void {
    if (!this.device || width <= 0 || height <= 0) return;
    this.cssWidth = width;
    this.cssHeight = height;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, QUALITY_PROFILES[this.tier].dprCap);
    this.device.resize(width, height, this.pixelRatio);
    this.instance?.resize({ width, height, pixelRatio: this.pixelRatio });
  }

  private updateRunning(): void {
    if (!this.instance || !this.device || this.stateValue === 'lost') return;
    const shouldRun = this.reasons.size === 0;
    if (shouldRun && !this.removeTask) {
      this.lastTime = null;
      this.removeTask = this.options.scheduler.add((now) => this.frame(now));
      this.setState('running');
    } else if (!shouldRun && this.removeTask) {
      this.removeTask();
      this.removeTask = null;
      this.setState('paused');
    } else if (!shouldRun && this.stateValue !== 'paused') {
      this.setState('paused');
    }
  }

  private frame(nowMs: number): void {
    const instance = this.instance;
    const device = this.device;
    if (!instance || !device || device.lost) return;
    const last = this.lastTime;
    this.lastTime = nowMs;
    const deltaSeconds = last === null ? 0 : Math.max(0, (nowMs - last) / 1000);
    if (last !== null) {
      const next = this.adaptive.sample(deltaSeconds * 1000);
      if (next !== null && (this.config.quality ?? 'auto') === 'auto') this.changeTier(next);
    }
    const profile = QUALITY_PROFILES[this.tier];
    this.time += Math.min(deltaSeconds, 0.25);
    const stepSeconds = 1 / profile.simHz;
    const { steps, alpha } = this.stepper.advance(deltaSeconds);
    const input = {
      time: this.time,
      deltaSeconds,
      stepSeconds,
      viewport: { width: this.cssWidth, height: this.cssHeight, pixelRatio: this.pixelRatio },
      pointer: this.pointerSample(),
      scroll: 0,
      reducedMotion: false,
    };
    // The 30 Hz tier simulates every second 1/60 s step; the odd one is carried to the next frame.
    let simSteps = steps;
    if (profile.simHz === 30) {
      this.pendingSteps += steps;
      simSteps = Math.floor(this.pendingSteps / 2);
      this.pendingSteps -= simSteps * 2;
    } else this.pendingSteps = 0;
    instance.update(input, simSteps);
    instance.render({ target: device, input, alpha });
    if (this.stateValue === 'running') this.options.host.classList.add('sws-fx--live');
  }

  private pointerSample(): PointerSample | null {
    const pointer = this.pointer;
    if (!pointer) return null;
    const host = this.options.host;
    const rect = host.getBoundingClientRect();
    // The layer may be rotated or scaled (layer rotation, editor zoom): map the offset from its centre
    // back through the inverse of the accumulated transform into the layer's own pixels.
    const m = linearTransform(host);
    const det = m.a * m.d - m.b * m.c;
    const ox = pointer.x - (rect.left + rect.right) / 2;
    const oy = pointer.y - (rect.top + rect.bottom) / 2;
    const lx = Math.abs(det) < 1e-9 ? ox : (m.d * ox - m.c * oy) / det;
    const ly = Math.abs(det) < 1e-9 ? oy : (-m.b * ox + m.a * oy) / det;
    const dxl = pointer.x - pointer.px;
    const dyl = pointer.y - pointer.py;
    const sample: PointerSample = {
      x: this.cssWidth / 2 + lx,
      y: this.cssHeight / 2 + ly,
      inside: Math.abs(lx) <= this.cssWidth / 2 && Math.abs(ly) <= this.cssHeight / 2,
      down: pointer.down,
      dx: Math.abs(det) < 1e-9 ? dxl : (m.d * dxl - m.c * dyl) / det,
      dy: Math.abs(det) < 1e-9 ? dyl : (-m.b * dxl + m.a * dyl) / det,
    };
    this.pointer = { ...pointer, px: pointer.x, py: pointer.y };
    return sample;
  }

  private changeTier(tier: QualityTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.instance?.setQuality(tier);
    this.applySize(this.cssWidth, this.cssHeight);
  }

  private onLost(): void {
    this.removeTask?.();
    this.removeTask = null;
    this.options.host.classList.remove('sws-fx--live');
    this.setState('lost');
  }

  private async onRestored(): Promise<void> {
    if (this.stateValue === 'disposed' || !this.device) return;
    // Every GPU resource is gone: rebuild the instance from the same configuration.
    this.instance?.dispose();
    this.instance = null;
    if (this.restoreAttempts++ >= MAX_RESTORE_ATTEMPTS) return this.fallback();
    this.setState('loading');
    const ok = await this.createInstance(++this.generation);
    if (ok) {
      this.restoreAttempts = 0;
      this.updateRunning();
    }
  }

  private teardown(): void {
    this.removeTask?.();
    this.removeTask = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.intersection?.disconnect();
    this.intersection = null;
    this.offContext?.();
    this.offContext = null;
    try {
      this.instance?.dispose();
    } catch (error) {
      console.warn('sw-sliderman: effect dispose failed', error);
    }
    this.instance = null;
    this.device?.dispose();
    this.device = null;
    this.canvas?.remove();
    this.canvas = null;
    this.lastTime = null;
    this.reasons.delete('offscreen');
  }
}

interface Linear {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Linear part (rotation, scale, skew) of the CSS transforms of an element and all its ancestors. */
function linearTransform(element: Element): Linear {
  let total: Linear = { a: 1, b: 0, c: 0, d: 1 };
  for (let el: Element | null = element; el; el = el.parentElement) {
    const css = getComputedStyle(el).transform;
    if (!css || css === 'none') continue;
    const values = /^matrix(3d)?\((.+)\)$/.exec(css);
    const parts = values?.[2]?.split(',').map(Number);
    if (!parts || parts.some((n) => !Number.isFinite(n))) continue;
    const t: Linear =
      values?.[1] === undefined
        ? { a: parts[0] ?? 1, b: parts[1] ?? 0, c: parts[2] ?? 0, d: parts[3] ?? 1 }
        : { a: parts[0] ?? 1, b: parts[1] ?? 0, c: parts[4] ?? 0, d: parts[5] ?? 1 };
    total = {
      a: t.a * total.a + t.c * total.b,
      b: t.b * total.a + t.d * total.b,
      c: t.a * total.c + t.c * total.d,
      d: t.b * total.c + t.d * total.d,
    };
  }
  return total;
}
