import type { AnimationPhase, Easing, Layer } from './types';

/** The parts of a layer/slide that determine timing (also the runtime config shape). */
export type TimedLayer = Pick<Layer, 'id' | 'animation'>;
export interface TimedSlide {
  readonly durationMs: number;
  readonly layers: readonly TimedLayer[];
}

/**
 * Animation timeline of one slide (PLAN.md 7.1). Editor preview and frontend runtime use this
 * module; src/Domain/Schedule.php computes the same effective slide duration (fixtures in
 * tests/fixtures/schedule).
 *
 * The clock starts when the slide becomes active. All values are milliseconds relative to that
 * moment.
 */

export interface ScheduledPhase {
  readonly preset: AnimationPhase['preset'];
  readonly delayMs: number;
  readonly durationMs: number;
  readonly easing: Easing;
  readonly distance: number;
}

export interface LayerSchedule {
  readonly layerId: string;
  readonly enter: ScheduledPhase | null;
  readonly exit: ScheduledPhase | null;
}

export interface SlideSchedule {
  /** Effective duration: at least the end of every mandatory animation. */
  readonly durationMs: number;
  /** True when the configured slide duration was shorter than its animations. */
  readonly extended: boolean;
  readonly layers: readonly LayerSchedule[];
}

function toPhase(phase: AnimationPhase): ScheduledPhase | null {
  if (phase.preset === 'none' || phase.durationMs === 0) return null;
  return {
    preset: phase.preset,
    delayMs: phase.startMs,
    durationMs: phase.durationMs,
    easing: phase.easing,
    distance: phase.distance,
  };
}

/** End of all mandatory animations of a layer (enter, and timed exit). */
export function layerAnimationEndMs(layer: TimedLayer): number {
  const enter = layer.animation.enter;
  let end = enter.preset === 'none' ? 0 : enter.startMs + enter.durationMs;
  const exit = layer.animation.exit;
  if (exit.mode === 'timed' && exit.preset !== 'none') {
    end = Math.max(end, exit.startMs + exit.durationMs);
  }
  return end;
}

export function effectiveSlideDurationMs(slide: TimedSlide): number {
  return slide.layers.reduce((max, layer) => Math.max(max, layerAnimationEndMs(layer)), slide.durationMs);
}

export function scheduleSlide(slide: TimedSlide): SlideSchedule {
  const durationMs = effectiveSlideDurationMs(slide);
  return {
    durationMs,
    extended: durationMs > slide.durationMs,
    layers: slide.layers.map((layer) => ({
      layerId: layer.id,
      enter: toPhase(layer.animation.enter),
      exit: layer.animation.exit.mode === 'timed' ? toPhase(layer.animation.exit) : null,
    })),
  };
}
