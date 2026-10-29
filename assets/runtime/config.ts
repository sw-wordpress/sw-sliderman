import { ANIMATION_PRESETS, EASINGS } from '@shared/types';
import type { AnimationPhase, Breakpoints, ExitAnimation, LayerAnimation, TransitionType } from '@shared/types';
import type { TimedSlide } from '@shared/schedule';

/**
 * Public runtime configuration printed by src/Rendering/SliderRenderer.php::config_json().
 * Parsed defensively: the markup may come from a cache or a different plugin version.
 */
export interface RuntimeSlide extends TimedSlide {
  readonly id: string;
  readonly transition: { readonly type: TransitionType; readonly durationMs: number };
}

export interface RuntimeConfig {
  readonly autoplay: boolean;
  readonly loop: boolean;
  readonly breakpoints: Breakpoints;
  readonly slides: readonly RuntimeSlide[];
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function phase(value: unknown): AnimationPhase {
  const raw = isObject(value) ? value : {};
  return {
    preset: oneOf(raw.preset, ANIMATION_PRESETS, 'none'),
    startMs: num(raw.startMs, 0),
    durationMs: num(raw.durationMs, 0),
    easing: oneOf(raw.easing, EASINGS, 'ease'),
    distance: num(raw.distance, 0),
  };
}

function animation(value: unknown): LayerAnimation {
  const raw = isObject(value) ? value : {};
  const exitRaw = isObject(raw.exit) ? raw.exit : {};
  const exit: ExitAnimation = exitRaw.mode === 'timed' ? { mode: 'timed', ...phase(exitRaw) } : { mode: 'slide-end' };
  return { enter: phase(raw.enter), exit };
}

function breakpoints(value: unknown): Breakpoints | null {
  if (!isObject(value)) return null;
  const read = (name: string): { minWidth: number; stageWidth: number; stageHeight: number } | null => {
    const bp = value[name];
    if (!isObject(bp)) return null;
    const stageWidth = num(bp.stageWidth, 0);
    const stageHeight = num(bp.stageHeight, 0);
    if (stageWidth <= 0 || stageHeight <= 0) return null;
    return { minWidth: num(bp.minWidth, 0), stageWidth, stageHeight };
  };
  const desktop = read('desktop');
  const tablet = read('tablet');
  const mobile = read('mobile');
  return desktop && tablet && mobile ? { desktop, tablet, mobile } : null;
}

export function parseConfig(text: string): RuntimeConfig | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(raw) || !Array.isArray(raw.slides)) return null;
  const bps = breakpoints(raw.breakpoints);
  if (!bps) return null;
  const slides: RuntimeSlide[] = raw.slides.filter(isObject).map((slide) => {
    const transition = isObject(slide.transition) ? slide.transition : {};
    return {
      id: typeof slide.id === 'string' ? slide.id : '',
      durationMs: Math.max(1000, num(slide.durationMs, 6000)),
      transition: {
        type: oneOf(transition.type, ['cut', 'fade', 'slide'] as const, 'fade'),
        durationMs: num(transition.durationMs, 0),
      },
      layers: Array.isArray(slide.layers)
        ? slide.layers.filter(isObject).map((layer) => ({
            id: typeof layer.id === 'string' ? layer.id : '',
            animation: animation(layer.animation),
          }))
        : [],
    };
  });
  return { autoplay: raw.autoplay === true, loop: raw.loop !== false, breakpoints: bps, slides };
}
