import { anchoredX, anchoredY, resolveBox, resolveLayerLayout } from '@shared/layout';
import {
  OVERRIDABLE_STYLE_KEYS,
  type BreakpointName,
  type Layer,
  type LayerLayout,
  type LayerStyle,
  type LayerType,
  type OverridableStyleKey,
  type Slide,
  type SliderDocument,
} from '@shared/types';
import { newId } from '@editor/utils/ids';

/**
 * Pure document operations used by the editor store. Every function returns a new document;
 * the input is never mutated (history entries stay intact).
 */

export type DeepMutable<T> = T extends ReadonlyArray<infer U>
  ? DeepMutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T;

/**
 * Independent deep copy that may be changed. structuredClone returns a fresh plain object; only
 * its readonly typing is dropped here (the one place where this happens).
 */
export function mutable<T>(value: T): DeepMutable<T> {
  return structuredClone(value) as DeepMutable<T>;
}

/** Deep-copies the document and lets `recipe` change the copy. */
export function produce(document: SliderDocument, recipe: (draft: DeepMutable<SliderDocument>) => void): SliderDocument {
  const draft = mutable(document);
  recipe(draft);
  return draft;
}

export function findSlide(document: DeepMutable<SliderDocument>, slideId: string): DeepMutable<Slide> | undefined {
  return document.slides.find((slide) => slide.id === slideId);
}

export function findLayer(document: DeepMutable<SliderDocument>, layerId: string): DeepMutable<Layer> | undefined {
  for (const slide of document.slides) {
    const layer = slide.layers.find((l) => l.id === layerId);
    if (layer) return layer;
  }
  return undefined;
}

function baseStyle(type: LayerType): LayerStyle {
  return {
    fontRef: null,
    fontSize: type === 'text' ? 48 : 20,
    lineHeight: 1.2,
    letterSpacing: 0,
    color: type === 'button' ? '#0f172a' : '#ffffff',
    textAlign: type === 'text' ? 'left' : 'center',
    backgroundColor: type === 'button' ? '#facc15' : null,
    borderRadius: type === 'button' ? 10 : 0,
    paddingX: type === 'button' ? 24 : 0,
    paddingY: type === 'button' ? 12 : 0,
    opacity: 1,
  };
}

/** New layer centred on the stage of `breakpoint` (coordinates are base/desktop values). */
export function createLayer(type: LayerType, stageWidth: number, stageHeight: number, name: string): Layer {
  const size = { text: [640, 120], image: [480, 320], button: [240, 56] }[type];
  const [width = 200, height = 100] = size;
  const layout: LayerLayout = {
    x: Math.round((stageWidth - width) / 2),
    y: Math.round((stageHeight - height) / 2),
    width,
    height,
    anchorX: 'left',
    anchorY: 'top',
    rotation: 0,
    visible: true,
  };
  const common = {
    id: newId(),
    name,
    locked: false,
    layout,
    style: baseStyle(type),
    overrides: {},
    animation: {
      enter: { preset: 'fade', startMs: 0, durationMs: 600, easing: 'ease-out', distance: 40 },
      exit: { mode: 'slide-end' },
    },
  } as const;
  switch (type) {
    case 'text':
      return { ...common, type, content: { text: name, tag: 'h2' } };
    case 'image':
      return { ...common, type, content: { attachmentId: null, alt: '', decorative: false, fit: 'cover' } };
    case 'button':
      return { ...common, type, content: { label: name, url: 'https://', newTab: false } };
    default: {
      const unknown: never = type;
      throw new Error(`Unknown layer type ${String(unknown)}`);
    }
  }
}

export function createSlide(name: string): Slide {
  return {
    id: newId(),
    name,
    enabled: true,
    durationMs: 6000,
    background: { color: '#1e293b', attachmentId: null, fit: 'cover' },
    transition: { type: 'fade', durationMs: 600 },
    layers: [],
  };
}

/** Copy with fresh IDs for the slide and all its layers (PLAN.md 9.2). */
export function cloneSlide(slide: Slide, name: string): Slide {
  return { ...structuredClone(slide), id: newId(), name, layers: slide.layers.map((l) => cloneLayer(l, l.name)) };
}

export function cloneLayer(layer: Layer, name: string): Layer {
  return { ...structuredClone(layer), id: newId(), name };
}

/**
 * Sets a layout value for the edited breakpoint: desktop changes the base, tablet/mobile write an
 * override. Overrides are never created implicitly for other breakpoints.
 */
export function setLayoutValue<K extends keyof LayerLayout>(
  layer: DeepMutable<Layer>,
  breakpoint: BreakpointName,
  key: K,
  value: LayerLayout[K],
): void {
  if (breakpoint === 'desktop') {
    Object.assign(layer.layout, { [key]: value });
    return;
  }
  const override = (layer.overrides[breakpoint] ??= {});
  const target: Partial<LayerLayout> = (override.layout ??= {});
  Object.assign(target, { [key]: value });
}

export function isOverridableStyle(key: keyof LayerStyle): key is OverridableStyleKey {
  return (OVERRIDABLE_STYLE_KEYS as readonly string[]).includes(key);
}

/** Overridable style keys follow the breakpoint; all other style keys always change the base. */
export function setStyleValue<K extends keyof LayerStyle>(
  layer: DeepMutable<Layer>,
  breakpoint: BreakpointName,
  key: K,
  value: LayerStyle[K],
): void {
  if (breakpoint === 'desktop' || !isOverridableStyle(key)) {
    Object.assign(layer.style, { [key]: value });
    return;
  }
  const override = (layer.overrides[breakpoint] ??= {});
  const target: Partial<Pick<LayerStyle, OverridableStyleKey>> = (override.style ??= {});
  Object.assign(target, { [key]: value });
}

/** "Reset" removes the override so the value is inherited again (PLAN.md 6). */
export function resetOverride(layer: DeepMutable<Layer>, breakpoint: BreakpointName, group: 'layout' | 'style', key: string): void {
  if (breakpoint === 'desktop') return;
  const override = layer.overrides[breakpoint];
  const values = override?.[group] as Record<string, unknown> | undefined;
  if (!override || !values) return;
  delete values[key];
  if (Object.keys(values).length === 0) delete override[group];
  if (Object.keys(override).length === 0) delete layer.overrides[breakpoint];
}

/**
 * Moves/resizes a layer to a top-left box in stage pixels of `breakpoint`, converting back to the
 * anchor-relative coordinates of the effective layout. Values are rounded to 0.1 px.
 */
export function setLayerBox(
  layer: DeepMutable<Layer>,
  breakpoint: BreakpointName,
  stageWidth: number,
  stageHeight: number,
  box: { left: number; top: number; width: number; height: number },
  changed: { position: boolean; size: boolean },
): void {
  const effective = resolveLayerLayout(layer, breakpoint);
  const round = (value: number): number => Math.round(value * 10) / 10;
  const width = Math.max(1, round(box.width));
  const height = Math.max(1, round(box.height));
  if (changed.size) {
    setLayoutValue(layer, breakpoint, 'width', width);
    setLayoutValue(layer, breakpoint, 'height', height);
  }
  const sized = { ...effective, width, height };
  setLayoutValue(layer, breakpoint, 'x', round(anchoredX(sized, box.left, width, stageWidth)));
  setLayoutValue(layer, breakpoint, 'y', round(anchoredY(sized, box.top, height, stageHeight)));
}

/** Top-left box of a layer in stage pixels for `breakpoint`. */
export function layerBox(layer: Layer, breakpoint: BreakpointName, stageWidth: number, stageHeight: number) {
  return resolveBox(resolveLayerLayout(layer, breakpoint), stageWidth, stageHeight);
}

/** Moves an item within a list by `delta` positions (clamped). */
export function moveItem<T>(list: T[], index: number, delta: number): void {
  const target = Math.max(0, Math.min(list.length - 1, index + delta));
  if (target === index) return;
  const [item] = list.splice(index, 1);
  if (item !== undefined) list.splice(target, 0, item);
}

/** Keeps only font references used by at least one layer. */
export function pruneFontRefs(document: DeepMutable<SliderDocument>): void {
  const used = new Set(document.slides.flatMap((s) => s.layers.map((l) => l.style.fontRef)).filter((r) => r !== null));
  document.fontRefs = document.fontRefs.filter((ref) => used.has(ref.id));
}

/** Returns the ID of a font reference for an installed variant, adding it when missing. */
export function ensureFontRef(
  document: DeepMutable<SliderDocument>,
  installationId: string,
  weight: number,
  style: 'normal' | 'italic',
): string {
  const existing = document.fontRefs.find(
    (ref) => ref.installationId === installationId && ref.weight === weight && ref.style === style,
  );
  if (existing) return existing.id;
  const id = newId();
  document.fontRefs.push({ id, installationId, weight, style });
  return id;
}
