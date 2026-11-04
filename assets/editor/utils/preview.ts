import { resolveStage } from '@shared/layout';
import type { BreakpointName, Breakpoints } from '@shared/types';

export const PREVIEW_MIN = 200;
export const PREVIEW_MAX = 3000;

export interface PreviewInfo {
  readonly width: number;
  readonly breakpoint: BreakpointName;
  /** Container width / stage width of the active breakpoint. */
  readonly scale: number;
  /** Rendered size of a font of `fontSize` stage pixels, rounded to 0.1 px. */
  readonly renderedFontSize: number;
}

/** What a visitor sees with a container of `width` px: active breakpoint, scale and text size. */
export function previewInfo(
  breakpoints: Breakpoints,
  width: number,
  fontSize: number,
): PreviewInfo {
  const clamped = Math.min(PREVIEW_MAX, Math.max(PREVIEW_MIN, Math.round(width)));
  const stage = resolveStage(breakpoints, clamped);
  return {
    width: clamped,
    breakpoint: stage.breakpoint,
    scale: stage.scale,
    renderedFontSize: Math.round(fontSize * stage.scale * 10) / 10,
  };
}
