/**
 * Slider document contract, schema version 1 (see schemas/slider-document.v1.schema.json and
 * docs/document-model.md). The PHP validator (src/Domain/DocumentValidator.php) enforces the same
 * rules; both are checked against tests/fixtures/documents.
 */

export const SCHEMA_VERSION = 1;

export type BreakpointName = 'desktop' | 'tablet' | 'mobile';

/** Resolution order of responsive overrides: every breakpoint inherits from the previous one. */
export const BREAKPOINT_ORDER: readonly BreakpointName[] = ['desktop', 'tablet', 'mobile'];

export interface Breakpoint {
  readonly minWidth: number;
  readonly stageWidth: number;
  readonly stageHeight: number;
}

export type Breakpoints = Readonly<Record<BreakpointName, Breakpoint>>;

export type SliderLayoutMode = 'boxed' | 'full';

export interface SliderSettings {
  readonly label: string;
  readonly layout: SliderLayoutMode;
  readonly maxWidth: number;
  readonly autoplay: boolean;
  readonly loop: boolean;
  readonly showArrows: boolean;
  readonly showDots: boolean;
}

export type FontStyle = 'normal' | 'italic';

export interface FontRef {
  readonly id: string;
  readonly installationId: string;
  readonly weight: number;
  readonly style: FontStyle;
}

export type AnchorX = 'left' | 'center' | 'right';
export type AnchorY = 'top' | 'center' | 'bottom';

export interface LayerLayout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly anchorX: AnchorX;
  readonly anchorY: AnchorY;
  readonly rotation: number;
  readonly visible: boolean;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface LayerStyle {
  readonly fontRef: string | null;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly color: string;
  readonly textAlign: TextAlign;
  readonly backgroundColor: string | null;
  readonly borderRadius: number;
  readonly paddingX: number;
  readonly paddingY: number;
  readonly opacity: number;
  /** Optional since the first v1 documents; absent means: no border / no shadow (see css.ts). */
  readonly borderWidth?: number;
  readonly borderColor?: string;
  readonly shadowX?: number;
  readonly shadowY?: number;
  readonly shadowBlur?: number;
  /** `null` or absent: no shadow. */
  readonly shadowColor?: string | null;
  readonly shadowOpacity?: number;
}

/** Style properties that may differ per breakpoint. Everything else is shared by all breakpoints. */
export const OVERRIDABLE_STYLE_KEYS = [
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'paddingX',
  'paddingY',
] as const;
export type OverridableStyleKey = (typeof OVERRIDABLE_STYLE_KEYS)[number];

export const LAYOUT_KEYS = [
  'x',
  'y',
  'width',
  'height',
  'anchorX',
  'anchorY',
  'rotation',
  'visible',
] as const;

export interface LayerOverride {
  readonly layout?: Partial<LayerLayout>;
  readonly style?: Partial<Pick<LayerStyle, OverridableStyleKey>>;
}

export type OverridableBreakpoint = Exclude<BreakpointName, 'desktop'>;
export type LayerOverrides = Readonly<Partial<Record<OverridableBreakpoint, LayerOverride>>>;

export const ANIMATION_PRESETS = [
  'none',
  'fade',
  'slide-up',
  'slide-down',
  'slide-left',
  'slide-right',
  'zoom-in',
  'zoom-out',
  'rotate',
  'reveal-left',
  'reveal-circle',
] as const;
export type AnimationPreset = (typeof ANIMATION_PRESETS)[number];

export const EASINGS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'] as const;
export type Easing = (typeof EASINGS)[number];

export interface AnimationPhase {
  readonly preset: AnimationPreset;
  readonly startMs: number;
  readonly durationMs: number;
  readonly easing: Easing;
  /** Travel distance of movement presets in stage pixels. */
  readonly distance: number;
}

export type ExitAnimation =
  { readonly mode: 'slide-end' } | ({ readonly mode: 'timed' } & AnimationPhase);

export interface LayerAnimation {
  readonly enter: AnimationPhase;
  readonly exit: ExitAnimation;
}

export type TextTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'div';
export const TEXT_TAGS: readonly TextTag[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div'];

/** Inline link of a rich text run; the URL follows the same policy as button links. */
export interface RichLink {
  readonly url: string;
  readonly newTab?: boolean;
}

/** One formatted piece of text. A `\n` inside `text` is a line break. */
export interface RichRun {
  readonly text: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly link?: RichLink;
}

export interface RichParagraph {
  readonly runs: readonly RichRun[];
}

export interface TextContent {
  /** Plain-text mirror of `rich` (or the whole text of a plain layer). */
  readonly text: string;
  readonly tag: TextTag;
  /** Optional structured rich text; when present it is what is rendered. */
  readonly rich?: readonly RichParagraph[];
}

export type ImageFit = 'cover' | 'contain';

export interface ImageContent {
  readonly attachmentId: number | null;
  readonly alt: string;
  readonly decorative: boolean;
  readonly fit: ImageFit;
  /** Optional link target (same URL policy as buttons); absent or empty: no link. */
  readonly linkUrl?: string;
  readonly linkNewTab?: boolean;
  /** Optional focal point in percent (default 50), rendered as object-position. */
  readonly focalX?: number;
  readonly focalY?: number;
}

export interface ButtonContent {
  readonly label: string;
  readonly url: string;
  readonly newTab: boolean;
  /** Optional hover/focus colours (6-digit hex); absent = the layer's normal look. */
  readonly hoverBackgroundColor?: string;
  readonly hoverColor?: string;
  readonly focusOutlineColor?: string;
}

export const SHAPE_KINDS = ['rectangle', 'circle'] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export interface ShapeContent {
  readonly kind: ShapeKind;
}

interface LayerBase {
  readonly id: string;
  readonly name: string;
  readonly locked: boolean;
  readonly layout: LayerLayout;
  readonly style: LayerStyle;
  readonly overrides: LayerOverrides;
  readonly animation: LayerAnimation;
}

export type TextLayer = LayerBase & { readonly type: 'text'; readonly content: TextContent };
export type ImageLayer = LayerBase & { readonly type: 'image'; readonly content: ImageContent };
export type ButtonLayer = LayerBase & { readonly type: 'button'; readonly content: ButtonContent };

export type ShapeLayer = LayerBase & { readonly type: 'shape'; readonly content: ShapeContent };

export type Layer = TextLayer | ImageLayer | ButtonLayer | ShapeLayer;
export type LayerType = Layer['type'];
export const LAYER_TYPES: readonly LayerType[] = ['text', 'image', 'button', 'shape'];

export type TransitionType = 'cut' | 'fade' | 'slide';

export interface SlideTransition {
  readonly type: TransitionType;
  readonly durationMs: number;
}

export interface SlideBackground {
  readonly color: string | null;
  readonly attachmentId: number | null;
  readonly fit: ImageFit;
  /** Optional colour laid over the background image; absent or null: none. */
  readonly overlayColor?: string | null;
  /** Optional; DEFAULT_OVERLAY_OPACITY when a colour is set and this is absent. */
  readonly overlayOpacity?: number;
  /** Optional focal point of the background image in percent (default 50). */
  readonly focalX?: number;
  readonly focalY?: number;
}

export const DEFAULT_OVERLAY_OPACITY = 0.4;
export const DEFAULT_FOCAL = 50;

/** Optional M9 effects. Missing switches are off; old documents keep their appearance. */
export interface SlideEffects {
  readonly cinematic?: boolean;
  readonly lightSweep?: boolean;
}

export interface Slide {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly durationMs: number;
  readonly background: SlideBackground;
  readonly effects?: SlideEffects;
  readonly transition: SlideTransition;
  readonly layers: readonly Layer[];
}

export interface SliderDocument {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly settings: SliderSettings;
  readonly breakpoints: Breakpoints;
  readonly fontRefs: readonly FontRef[];
  readonly slides: readonly Slide[];
}
