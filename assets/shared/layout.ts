import {
  BREAKPOINT_ORDER,
  OVERRIDABLE_STYLE_KEYS,
  type Breakpoint,
  type BreakpointName,
  type Breakpoints,
  type Layer,
  type LayerLayout,
  type LayerStyle,
  type SliderDocument,
} from './types';

/**
 * Container-based layout resolver (PLAN.md 6). Pure and deterministic; the PHP renderer
 * (src/Domain/LayoutResolver.php) implements the same rules and both are tested against
 * tests/fixtures/layout.
 *
 * - The active breakpoint depends on the slider CONTAINER width, never on the viewport.
 * - Overrides inherit property by property: desktop (base) -> tablet -> mobile.
 *   A missing override value means "inherit"; there is no implicit 0/null.
 * - Layers are positioned in logical stage pixels relative to their anchor; the stage is scaled
 *   proportionally to the container width.
 */

export interface StageBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ResolvedLayer {
  readonly id: string;
  readonly layout: LayerLayout;
  readonly style: LayerStyle;
  readonly box: StageBox;
}

export interface ResolvedStage {
  readonly breakpoint: BreakpointName;
  readonly stageWidth: number;
  readonly stageHeight: number;
  /** Rendered pixels per stage pixel for the given container width. */
  readonly scale: number;
}

export function breakpointForWidth(breakpoints: Breakpoints, containerWidth: number): BreakpointName {
  if (containerWidth >= breakpoints.desktop.minWidth) return 'desktop';
  if (containerWidth >= breakpoints.tablet.minWidth) return 'tablet';
  return 'mobile';
}

export function resolveStage(breakpoints: Breakpoints, containerWidth: number): ResolvedStage {
  const breakpoint = breakpointForWidth(breakpoints, containerWidth);
  const bp: Breakpoint = breakpoints[breakpoint];
  return {
    breakpoint,
    stageWidth: bp.stageWidth,
    stageHeight: bp.stageHeight,
    scale: containerWidth / bp.stageWidth,
  };
}

/** Breakpoints whose overrides apply to `breakpoint`, in resolution order (desktop excluded). */
export function overrideChain(breakpoint: BreakpointName): Array<Exclude<BreakpointName, 'desktop'>> {
  const chain: Array<Exclude<BreakpointName, 'desktop'>> = [];
  for (const name of BREAKPOINT_ORDER) {
    if (name !== 'desktop') chain.push(name);
    if (name === breakpoint) break;
  }
  return breakpoint === 'desktop' ? [] : chain;
}

export function resolveLayerLayout(layer: Layer, breakpoint: BreakpointName): LayerLayout {
  let layout: LayerLayout = layer.layout;
  for (const name of overrideChain(breakpoint)) {
    const override = layer.overrides[name]?.layout;
    if (override) layout = { ...layout, ...override };
  }
  return layout;
}

export function resolveLayerStyle(layer: Layer, breakpoint: BreakpointName): LayerStyle {
  let style: LayerStyle = layer.style;
  for (const name of overrideChain(breakpoint)) {
    const override = layer.overrides[name]?.style;
    if (!override) continue;
    const picked: Partial<LayerStyle> = {};
    for (const key of OVERRIDABLE_STYLE_KEYS) {
      const value = override[key];
      if (value !== undefined) Object.assign(picked, { [key]: value });
    }
    style = { ...style, ...picked };
  }
  return style;
}

/** Converts anchor-relative coordinates to the top-left box in stage pixels. */
export function resolveBox(layout: LayerLayout, stageWidth: number, stageHeight: number): StageBox {
  let left = layout.x;
  if (layout.anchorX === 'center') left = (stageWidth - layout.width) / 2 + layout.x;
  if (layout.anchorX === 'right') left = stageWidth - layout.width - layout.x;
  let top = layout.y;
  if (layout.anchorY === 'center') top = (stageHeight - layout.height) / 2 + layout.y;
  if (layout.anchorY === 'bottom') top = stageHeight - layout.height - layout.y;
  return { left, top, width: layout.width, height: layout.height };
}

/** Inverse of resolveBox for one axis: the anchor-relative coordinate of a top-left position. */
export function anchoredX(layout: LayerLayout, left: number, width: number, stageWidth: number): number {
  if (layout.anchorX === 'center') return left - (stageWidth - width) / 2;
  if (layout.anchorX === 'right') return stageWidth - width - left;
  return left;
}

export function anchoredY(layout: LayerLayout, top: number, height: number, stageHeight: number): number {
  if (layout.anchorY === 'center') return top - (stageHeight - height) / 2;
  if (layout.anchorY === 'bottom') return stageHeight - height - top;
  return top;
}

export function resolveLayer(
  layer: Layer,
  breakpoint: BreakpointName,
  breakpoints: Breakpoints,
): ResolvedLayer {
  const layout = resolveLayerLayout(layer, breakpoint);
  const bp = breakpoints[breakpoint];
  return {
    id: layer.id,
    layout,
    style: resolveLayerStyle(layer, breakpoint),
    box: resolveBox(layout, bp.stageWidth, bp.stageHeight),
  };
}

/** Resolves every layer of a slide for a container width. */
export function resolveSlide(
  document: SliderDocument,
  slideIndex: number,
  containerWidth: number,
): { readonly stage: ResolvedStage; readonly layers: readonly ResolvedLayer[] } {
  const stage = resolveStage(document.breakpoints, containerWidth);
  const slide = document.slides[slideIndex];
  const layers = slide
    ? slide.layers.map((layer) => resolveLayer(layer, stage.breakpoint, document.breakpoints))
    : [];
  return { stage, layers };
}

/** Whether `breakpoint` itself defines a value for a layout/style key (as opposed to inheriting it). */
export function hasOverride(
  layer: Layer,
  breakpoint: BreakpointName,
  group: 'layout' | 'style',
  key: string,
): boolean {
  if (breakpoint === 'desktop') return false;
  const override = layer.overrides[breakpoint]?.[group];
  return override !== undefined && key in override;
}

/** Layer box exceeds the stage (diagnostic shown in the editor, PLAN.md 6). */
export function overflowsStage(box: StageBox, stageWidth: number, stageHeight: number): boolean {
  return box.left < 0 || box.top < 0 || box.left + box.width > stageWidth || box.top + box.height > stageHeight;
}
