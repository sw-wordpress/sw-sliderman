import type { AnimationPreset } from './types';
import type { ScheduledPhase } from './schedule';

/**
 * Keyframes for the limited 1.0 presets (PLAN.md 7.1), shared by editor preview and runtime.
 *
 * Keyframes only touch `opacity` and `transform` of the dedicated animation wrapper
 * (`.sws-layer__anim`); layout position and user rotation live on other elements, so the
 * transforms never compete (CODE-STYLE 13).
 *
 * `scale` converts stage pixels (preset distance) into rendered pixels.
 */

// A type alias (not an interface) so it is assignable to the DOM `Keyframe` index signature.
export type AnimationKeyframe = {
  readonly opacity: number;
  readonly transform: string;
};

function hiddenState(preset: AnimationPreset, distancePx: number): AnimationKeyframe {
  const d = Math.round(distancePx * 100) / 100;
  switch (preset) {
    case 'none':
      return { opacity: 1, transform: 'none' };
    case 'fade':
      return { opacity: 0, transform: 'none' };
    case 'slide-up':
      return { opacity: 0, transform: `translate3d(0, ${d}px, 0)` };
    case 'slide-down':
      return { opacity: 0, transform: `translate3d(0, ${-d}px, 0)` };
    case 'slide-left':
      return { opacity: 0, transform: `translate3d(${d}px, 0, 0)` };
    case 'slide-right':
      return { opacity: 0, transform: `translate3d(${-d}px, 0, 0)` };
    case 'zoom-in':
      return { opacity: 0, transform: 'scale(0.6)' };
    case 'zoom-out':
      return { opacity: 0, transform: 'scale(1.4)' };
    case 'rotate':
      return { opacity: 0, transform: 'rotate(-12deg)' };
    default: {
      const unknown: never = preset;
      throw new Error(`Unknown animation preset ${String(unknown)}`);
    }
  }
}

const VISIBLE: AnimationKeyframe = { opacity: 1, transform: 'none' };

export function enterKeyframes(phase: ScheduledPhase, scale: number): AnimationKeyframe[] {
  return [hiddenState(phase.preset, phase.distance * scale), VISIBLE];
}

export function exitKeyframes(phase: ScheduledPhase, scale: number): AnimationKeyframe[] {
  // Exits move in the opposite direction of the matching enter preset.
  return [VISIBLE, hiddenState(phase.preset, -phase.distance * scale)];
}

export function phaseTiming(phase: ScheduledPhase, kind: 'enter' | 'exit'): KeyframeAnimationOptions {
  return {
    delay: phase.delayMs,
    duration: phase.durationMs,
    easing: phase.easing,
    // Enter: `backwards` applies the hidden frame during the delay; afterwards the element shows
    // its static (visible) style, which is also the no-JS / reduced-motion state.
    // Exit: `forwards` keeps the layer hidden until the slide is left; the runtime cancels all
    // animations of a slide when it becomes active again.
    fill: kind === 'enter' ? 'backwards' : 'forwards',
  };
}
