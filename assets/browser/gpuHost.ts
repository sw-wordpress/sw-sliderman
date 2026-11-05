/**
 * Contract between the frontend runtime and the optional GPU bundle (build/gpu/gpu.js).
 * The runtime never imports the bundle; it only uses `window.swsGpu` when present (types only here).
 */
export interface EffectEntry {
  readonly layerId: string;
  readonly type: string;
  readonly schemaVersion: number;
  readonly seed: number;
  readonly quality: 'auto' | 'low' | 'medium' | 'high' | 'ultra';
  readonly continuous: boolean;
  /** Same-origin ES module URL (with the plugin or add-on version). */
  readonly module: string;
  readonly params: Record<string, unknown>;
  readonly assets: Readonly<
    Record<string, { readonly url: string; readonly width: number; readonly height: number }>
  >;
}

export interface GpuMount {
  /** A slide became visible (start of a transition or first display). */
  activate(slide: HTMLElement): void;
  /** A slide was left (after the transition). */
  deactivate(slide: HTMLElement): void;
  /** The slider's pause switch. */
  setUserPaused(paused: boolean): void;
  setReducedMotion(reduced: boolean): void;
  destroy(): void;
}

export interface GpuHost {
  readonly version: number;
  mount(root: HTMLElement, entries: readonly EffectEntry[], reducedMotion: boolean): GpuMount;
}

declare global {
  interface Window {
    swsGpu?: GpuHost;
  }
}
