import { overflowsStage, resolveBox, resolveLayerLayout, resolveLayerStyle } from './layout';
import { BREAKPOINT_ORDER, type BreakpointName, type SliderDocument } from './types';

/** Smallest rendered text size (px) before the editor warns, measured at the narrowest container. */
export const MIN_RENDERED_FONT_PX = 12;
/** Narrowest container assumed for a breakpoint: its own minWidth, but never below a phone. */
const PHONE_WIDTH = 320;

export type DiagnosticCode = 'overflow' | 'small_font';

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly slideId: string;
  readonly layerId: string;
  readonly breakpoint: BreakpointName;
  /** Rendered text size for `small_font`, rounded to 0.1 px. */
  readonly value?: number;
}

/**
 * Layout problems per breakpoint (PLAN.md 6): layers leaving the stage and text that becomes too
 * small once the stage is scaled down to the narrowest container of its breakpoint. Hidden layers
 * are ignored. Pure and DOM-free so it can be tested against the same resolver as the runtime.
 */
export function diagnose(document: SliderDocument): Diagnostic[] {
  const found: Diagnostic[] = [];
  for (const slide of document.slides) {
    for (const layer of slide.layers) {
      for (const breakpoint of BREAKPOINT_ORDER) {
        const layout = resolveLayerLayout(layer, breakpoint);
        if (!layout.visible) continue;
        const stage = document.breakpoints[breakpoint];
        const box = resolveBox(layout, stage.stageWidth, stage.stageHeight);
        if (overflowsStage(box, stage.stageWidth, stage.stageHeight))
          found.push({ code: 'overflow', slideId: slide.id, layerId: layer.id, breakpoint });
        if (layer.type === 'image' || layer.type === 'shape') continue;
        const narrowest = Math.max(stage.minWidth, PHONE_WIDTH);
        const rendered =
          Math.round(
            resolveLayerStyle(layer, breakpoint).fontSize *
              (Math.min(narrowest, stage.stageWidth) / stage.stageWidth) *
              10,
          ) / 10;
        if (rendered < MIN_RENDERED_FONT_PX)
          found.push({
            code: 'small_font',
            slideId: slide.id,
            layerId: layer.id,
            breakpoint,
            value: rendered,
          });
      }
    }
  }
  return found;
}
