import type { ResolvedLayer } from './layout';
import type { FontRef, LayerStyle } from './types';

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
    ['background-color', style.backgroundColor === null ? 'transparent' : style.backgroundColor.toLowerCase()],
    ['border-radius', cqw(style.borderRadius, stageWidth)],
    ['padding', `${cqw(style.paddingY, stageWidth)} ${cqw(style.paddingX, stageWidth)}`],
    ['opacity', formatNumber(style.opacity)],
  ];
  return { box: boxDecl, body };
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
