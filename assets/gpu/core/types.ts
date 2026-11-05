import type { QualitySetting, QualityTier } from './quality';
import type { EasingName } from './transition';

/**
 * Backend-independent contracts of the effect platform (ADR 0005). Nothing here knows about the
 * DOM, WebGL or WebGPU: `update` receives plain data only, which keeps a worker/OffscreenCanvas
 * host possible. The device handle is an opaque type parameter that backends define.
 */

export type BackendKind = 'webgl2' | 'webgpu' | 'none';

/** Runtime configuration of one effect instance (assembled from the layer content). */
export interface EffectConfig {
  readonly type: string;
  readonly schemaVersion: number;
  readonly seed?: number;
  readonly enabled?: boolean;
  readonly quality?: QualitySetting;
  readonly params: Record<string, unknown>;
}

export interface Viewport {
  /** CSS pixels. */
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export interface PointerSample {
  /** Position in CSS pixels relative to the effect area; `inside` tells whether it is over it. */
  readonly x: number;
  readonly y: number;
  readonly inside: boolean;
  readonly down: boolean;
  /** Pixels moved since the previous frame. */
  readonly dx: number;
  readonly dy: number;
}

/** Everything an effect may read per frame; no DOM access. */
export interface FrameInput {
  /** Simulation time in seconds since start (paused time does not advance). */
  readonly time: number;
  readonly deltaSeconds: number;
  /** Length of one simulation step in seconds (1/60, or 1/30 on the `low` tier). */
  readonly stepSeconds: number;
  readonly viewport: Viewport;
  readonly pointer: PointerSample | null;
  /** Scroll progress of the effect area through the viewport, 0..1. */
  readonly scroll: number;
  readonly reducedMotion: boolean;
}

export type EffectEvent =
  | { readonly type: 'burst'; readonly intensity?: number }
  | {
      readonly type: 'strike';
      readonly x?: number;
      readonly y?: number;
      readonly intensity?: number;
    }
  | { readonly type: 'reset' };

export interface EffectState {
  readonly type: string;
  readonly schemaVersion: number;
  readonly seed: number;
  readonly params: Record<string, unknown>;
}

export interface TransitionOptions {
  readonly durationSeconds: number;
  readonly easing?: EasingName;
}

/** Resolves asset keys of the layer (e.g. `image`) to same-origin URLs. */
export interface AssetResolver {
  url(key: string): string | null;
}

export interface EffectContext<TDevice = unknown> {
  readonly device: TDevice;
  readonly backend: BackendKind;
  readonly seed: number;
  readonly quality: QualityTier;
  readonly reducedMotion: boolean;
  readonly assets: AssetResolver;
}

export interface RenderFrame<TTarget = unknown> {
  readonly target: TTarget;
  readonly input: FrameInput;
  /** Interpolation factor between the last two simulation steps. */
  readonly alpha: number;
}

export interface EffectInstance<TParams = Record<string, unknown>, TTarget = unknown> {
  update(input: FrameInput, steps: number): void;
  render(frame: RenderFrame<TTarget>): void;
  setParams(patch: Partial<TParams>): void;
  setQuality(tier: QualityTier): void;
  handleEvent(event: EffectEvent): void;
  captureState(): EffectState;
  transitionTo(state: EffectState, options: TransitionOptions): void;
  resize(viewport: Viewport): void;
  dispose(): void;
}

export interface EffectPreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly seed?: number;
  /** Partial parameters; only declared values override the schema defaults. */
  readonly params: Record<string, unknown>;
}

export interface EffectModule<TDevice = unknown> {
  /** Type id: `name` for built-in modules, `vendor/name` for add-ons. */
  readonly type: string;
  readonly schemaVersion: number;
  readonly label: string;
  /** Continuous motion needs the slider's pause switch (WCAG 2.2.2). */
  readonly continuous: boolean;
  readonly backends: readonly BackendKind[];
  readonly parameterSchema: unknown;
  readonly presets?: readonly EffectPreset[];
  /** Upgrades stored parameters of an older `schemaVersion`. */
  migrate?(params: Record<string, unknown>, fromVersion: number): Record<string, unknown>;
  create(context: EffectContext<TDevice>, params: Record<string, unknown>): Promise<EffectInstance>;
}

export const TYPE_ID_PATTERN =
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?$/;
export const TYPE_ID_MAX_LENGTH = 64;
