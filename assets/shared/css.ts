import type { ResolvedLayer } from './layout';
import {
  DEFAULT_FOCAL,
  DEFAULT_OVERLAY_OPACITY,
  type ButtonContent,
  type FontRef,
  type ImageContent,
  type LayerStyle,
  type ShapeKind,
  type SlideBackground,
} from './types';

/**
 * CSS declarations of a resolved layer, shared by the editor canvas and (mirrored 1:1 by
 * src/Rendering/StyleSerializer.php) the published frontend CSS.
 *
 * Positions are percentages of the stage, lengths are `cqw` of the slider container, so the stage
 * scales proportionally without JavaScript. Values come only from validated typed fields; nothing
 * from the document is copied into CSS as free text (CODE-STYLE 6.1).
 */

export type Declarations = ReadonlyArray<readonly [property: string, value: string]>;

export interface LayerDeclarations {
  /** `.sws-layer` box (position and size). */
  readonly box: Declarations;
  /** `.sws-layer__body` (rotation, typography, decoration). */
  readonly body: Declarations;
}

/** Fixed-precision number formatting identical to the PHP serializer. */
export function formatNumber(value: number): string {
  // Round half away from zero like PHP's round().
  const rounded = (Math.sign(value) * Math.round(Math.abs(value) * 10000)) / 10000;
  if (Object.is(rounded, -0) || rounded === 0) return '0';
  let text = rounded.toFixed(4);
  text = text.replace(/0+$/, '').replace(/\.$/, '');
  return text;
}

function percent(value: number, total: number): string {
  return `${formatNumber((value / total) * 100)}%`;
}

function cqw(value: number, stageWidth: number): string {
  return `${formatNumber((value * 100) / stageWidth)}cqw`;
}

/** Internal, collision-safe family name of a locally installed font. */
export function fontFamilyName(installationId: string): string {
  return `sws-${installationId}`;
}

export const DEFAULT_BORDER_COLOR = '#000000';
export const DEFAULT_SHADOW_OPACITY = 0.25;

/** `#rrggbb` + alpha as CSS rgba(); the colour was validated against the 6-digit hex pattern. */
function rgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${formatNumber(alpha)})`;
}

export const SYSTEM_FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function fontDeclarations(style: LayerStyle, fontRefs: readonly FontRef[]): Declarations {
  const ref = style.fontRef === null ? undefined : fontRefs.find((f) => f.id === style.fontRef);
  if (!ref) return [['font-family', SYSTEM_FONT_STACK]];
  return [
    ['font-family', `'${fontFamilyName(ref.installationId)}', ${SYSTEM_FONT_STACK}`],
    ['font-weight', String(ref.weight)],
    ['font-style', ref.style],
  ];
}

export function layerDeclarations(
  layer: ResolvedLayer,
  stageWidth: number,
  stageHeight: number,
  fontRefs: readonly FontRef[],
  shape?: ShapeKind,
): LayerDeclarations {
  const { box, layout, style } = layer;
  const boxDecl: Array<readonly [string, string]> = [
    ['left', percent(box.left, stageWidth)],
    ['top', percent(box.top, stageHeight)],
    ['width', percent(box.width, stageWidth)],
    ['height', percent(box.height, stageHeight)],
    ['display', layout.visible ? 'block' : 'none'],
  ];
  const body: Array<readonly [string, string]> = [
    ['transform', layout.rotation === 0 ? 'none' : `rotate(${formatNumber(layout.rotation)}deg)`],
    ...fontDeclarations(style, fontRefs),
    ['font-size', cqw(style.fontSize, stageWidth)],
    ['line-height', formatNumber(style.lineHeight)],
    ['letter-spacing', cqw(style.letterSpacing, stageWidth)],
    ['color', style.color.toLowerCase()],
    ['text-align', style.textAlign],
    [
      'background-color',
      style.backgroundColor === null ? 'transparent' : style.backgroundColor.toLowerCase(),
    ],
    ['border-radius', shape === 'circle' ? '50%' : cqw(style.borderRadius, stageWidth)],
    ['padding', `${cqw(style.paddingY, stageWidth)} ${cqw(style.paddingX, stageWidth)}`],
    ['opacity', formatNumber(style.opacity)],
  ];
  // Optional style fields: declarations appear only when they differ from "none".
  const borderWidth = style.borderWidth ?? 0;
  if (borderWidth > 0)
    body.push([
      'border',
      `${cqw(borderWidth, stageWidth)} solid ${(style.borderColor ?? DEFAULT_BORDER_COLOR).toLowerCase()}`,
    ]);
  if (style.shadowColor)
    body.push([
      'box-shadow',
      `${cqw(style.shadowX ?? 0, stageWidth)} ${cqw(style.shadowY ?? 0, stageWidth)} ${cqw(style.shadowBlur ?? 0, stageWidth)} ${rgba(style.shadowColor, style.shadowOpacity ?? DEFAULT_SHADOW_OPACITY)}`,
    ]);
  return { box: boxDecl, body };
}

/**
 * Hover and keyboard-focus rules of a button layer. `selector` is the layer's scoped selector
 * (`.sws-s-<scope> .sws-l-<id>`). Only colours that were set produce rules; the hover brightness
 * filter of runtime.css is switched off then so the chosen colour is shown as defined.
 * Mirrored by StyleSerializer::button_state_css().
 */
export function buttonStateCss(selector: string, content: ButtonContent): string {
  let css = '';
  const hover: Array<readonly [string, string]> = [];
  if (content.hoverBackgroundColor)
    hover.push(['background-color', content.hoverBackgroundColor.toLowerCase()]);
  if (content.hoverColor) hover.push(['color', content.hoverColor.toLowerCase()]);
  if (hover.length > 0) {
    css += `${selector} .sws-layer__body:hover{${serializeDeclarations(hover)}}`;
    css += `${selector} .sws-button:hover{filter:none;}`;
  }
  if (content.focusOutlineColor)
    css += `${selector} .sws-button:focus-visible{outline:3px solid ${content.focusOutlineColor.toLowerCase()};outline-offset:3px;}`;
  return css;
}

/** `object-position` value for a focal point in percent; null while it is the default centre. */
export function focalPosition(focalX?: number, focalY?: number): string | null {
  const x = focalX ?? DEFAULT_FOCAL;
  const y = focalY ?? DEFAULT_FOCAL;
  return x === DEFAULT_FOCAL && y === DEFAULT_FOCAL
    ? null
    : `${formatNumber(x)}% ${formatNumber(y)}%`;
}

/**
 * Overlay and focal point of a slide background. `selector` is the slide's scoped selector
 * (`.sws-s-<scope> .sws-sl-<id>`). The overlay sits between the background image and the stage.
 * Mirrored by StyleSerializer::slide_background_css().
 */
export function slideBackgroundCss(selector: string, background: SlideBackground): string {
  let css = '';
  if (background.overlayColor) {
    const alpha = background.overlayOpacity ?? DEFAULT_OVERLAY_OPACITY;
    css += `${selector}::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background-color:${rgba(background.overlayColor, alpha)};}`;
    css += `${selector} .sws-stage{z-index:2;}`;
  }
  const position = focalPosition(background.focalX, background.focalY);
  if (position !== null) css += `${selector} .sws-slide__bg{object-position:${position};}`;
  return css;
}

/** Focal point of an image layer (`selector` = `.sws-s-<scope> .sws-l-<id>`). */
export function imageFocalCss(selector: string, content: ImageContent): string {
  const position = focalPosition(content.focalX, content.focalY);
  return position === null ? '' : `${selector} .sws-image{object-position:${position};}`;
}

/** Serialises declarations as `prop:value;` pairs (used by tests and the editor). */
export function serializeDeclarations(declarations: Declarations): string {
  return declarations.map(([property, value]) => `${property}:${value};`).join('');
}

/** Vue style object from declarations. */
export function styleObject(declarations: Declarations): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [property, value] of declarations) out[property] = value;
  return out;
}
