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
  | { readonly mode: 'slide-end' }
  | ({ readonly mode: 'timed' } & AnimationPhase);

export interface LayerAnimation {
  readonly enter: AnimationPhase;
  readonly exit: ExitAnimation;
}

export type TextTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'div';
export const TEXT_TAGS: readonly TextTag[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div'];

export interface TextContent {
  readonly text: string;
  readonly tag: TextTag;
}

export type ImageFit = 'cover' | 'contain';

export interface ImageContent {
  readonly attachmentId: number | null;
  readonly alt: string;
  readonly decorative: boolean;
  readonly fit: ImageFit;
}

export interface ButtonContent {
  readonly label: string;
  readonly url: string;
  readonly newTab: boolean;
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

export type Layer = TextLayer | ImageLayer | ButtonLayer;
export type LayerType = Layer['type'];
export const LAYER_TYPES: readonly LayerType[] = ['text', 'image', 'button'];

export type TransitionType = 'cut' | 'fade' | 'slide';

export interface SlideTransition {
  readonly type: TransitionType;
  readonly durationMs: number;
}

export interface SlideBackground {
  readonly color: string | null;
  readonly attachmentId: number | null;
  readonly fit: ImageFit;
}

export interface Slide {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly durationMs: number;
  readonly background: SlideBackground;
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
