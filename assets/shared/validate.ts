import { canonicalBytes } from './canonical';
import { LIMITS } from './limits';
import {
  ANIMATION_PRESETS,
  EASINGS,
  OVERRIDABLE_STYLE_KEYS,
  SCHEMA_VERSION,
  LAYER_TYPES,
  SHAPE_KINDS,
  TEXT_TAGS,
  type SliderDocument,
} from './types';

/**
 * Runtime validator for slider documents (schema v1).
 *
 * Mirrors src/Domain/DocumentValidator.php rule by rule: both must report the same set of
 * `{ path, code }` issues for every fixture in tests/fixtures/documents. A wrongly typed value is
 * reported once and not inspected further; unknown keys are reported individually.
 */

export type IssueCode =
  | 'too_large'
  | 'type'
  | 'required'
  | 'unknown_key'
  | 'range'
  | 'length'
  | 'enum'
  | 'pattern'
  | 'url'
  | 'count'
  | 'duplicate_id'
  | 'reference'
  | 'schema_version'
  | 'breakpoint_order'
  | 'animation_order';

export interface ValidationIssue {
  /** JSON pointer of the offending value, e.g. `/slides/0/layers/2/layout/x`. */
  readonly path: string;
  readonly code: IssueCode;
}

export type ValidationResult =
  | { readonly ok: true; readonly document: SliderDocument }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
/**
 * Navigation URLs: http(s), mailto, tel, site-relative paths and fragments. Never `//host`,
 * `javascript:` or other schemes. Character classes are spelled out (no `\s`) so the PCRE copy in
 * DocumentValidator.php matches exactly the same strings.
 */
export const LINK_PATTERN =
  // eslint-disable-next-line no-control-regex -- control characters are deliberately excluded from links.
  /^(?:https?:\/\/[^\x00-\x20\x7F<>"]+|mailto:[^\x00-\x20\x7F<>"]+|tel:[0-9+().\- ]+|\/(?!\/)[^\x00-\x20\x7F<>"]*|#[^\x00-\x20\x7F<>"]*)$/i;

type Json = Record<string, unknown>;

class Context {
  readonly issues: ValidationIssue[] = [];
  readonly ids = new Set<string>();

  add(path: string, code: IssueCode): void {
    this.issues.push({ path, code });
  }
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function charLength(value: string): number {
  return [...value].length;
}

/**
 * Checks that `value` is an object with exactly the required keys (plus optional ones).
 * Returns the object when its type is right, otherwise null (issue already reported).
 */
function object(
  ctx: Context,
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): Json | null {
  if (!isObject(value)) {
    ctx.add(path, 'type');
    return null;
  }
  for (const key of required) {
    if (!(key in value)) ctx.add(`${path}/${key}`, 'required');
  }
  for (const key of Object.keys(value)) {
    if (!required.includes(key) && !optional.includes(key))
      ctx.add(`${path}/${key}`, 'unknown_key');
  }
  return value;
}

function present(obj: Json, key: string): boolean {
  return key in obj;
}

function str(ctx: Context, obj: Json, key: string, path: string, min: number, max: number): void {
  if (!present(obj, key)) return;
  const value = obj[key];
  const at = `${path}/${key}`;
  if (typeof value !== 'string') {
    ctx.add(at, 'type');
    return;
  }
  const length = charLength(value);
  if (length < min || length > max) ctx.add(at, 'length');
}

function bool(ctx: Context, obj: Json, key: string, path: string): void {
  if (present(obj, key) && typeof obj[key] !== 'boolean') ctx.add(`${path}/${key}`, 'type');
}

function num(
  ctx: Context,
  obj: Json,
  key: string,
  path: string,
  min: number,
  max: number,
  integer = false,
): void {
  if (!present(obj, key)) return;
  const value = obj[key];
  const at = `${path}/${key}`;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (integer && !Number.isInteger(value))
  ) {
    ctx.add(at, 'type');
    return;
  }
  if (value < min || value > max) ctx.add(at, 'range');
}

function enumeration(
  ctx: Context,
  obj: Json,
  key: string,
  path: string,
  allowed: readonly string[],
): void {
  if (!present(obj, key)) return;
  const value = obj[key];
  const at = `${path}/${key}`;
  if (typeof value !== 'string') {
    ctx.add(at, 'type');
    return;
  }
  if (!allowed.includes(value)) ctx.add(at, 'enum');
}

function color(ctx: Context, obj: Json, key: string, path: string, nullable: boolean): void {
  if (!present(obj, key)) return;
  const value = obj[key];
  const at = `${path}/${key}`;
  if (value === null && nullable) return;
  if (typeof value !== 'string') {
    ctx.add(at, 'type');
    return;
  }
  if (!COLOR_PATTERN.test(value)) ctx.add(at, 'pattern');
}

function attachment(ctx: Context, obj: Json, key: string, path: string): void {
  if (!present(obj, key) || obj[key] === null) return;
  num(ctx, obj, key, path, 1, Number.MAX_SAFE_INTEGER, true);
}

function id(ctx: Context, obj: Json, key: string, path: string, unique: boolean): void {
  if (!present(obj, key)) return;
  const value = obj[key];
  const at = `${path}/${key}`;
  if (typeof value !== 'string') {
    ctx.add(at, 'type');
    return;
  }
  if (!ID_PATTERN.test(value)) {
    ctx.add(at, 'pattern');
    return;
  }
  if (unique) {
    if (ctx.ids.has(value)) ctx.add(at, 'duplicate_id');
    ctx.ids.add(value);
  }
}

function list(
  ctx: Context,
  obj: Json,
  key: string,
  path: string,
  min: number,
  max: number,
): unknown[] {
  if (!present(obj, key)) return [];
  const value = obj[key];
  const at = `${path}/${key}`;
  if (!Array.isArray(value)) {
    ctx.add(at, 'type');
    return [];
  }
  if (value.length < min || value.length > max) ctx.add(at, 'count');
  return value;
}

function validateBreakpoints(ctx: Context, value: unknown, path: string): void {
  const bps = object(ctx, value, path, ['desktop', 'tablet', 'mobile']);
  if (!bps) return;
  const minWidths: Partial<Record<string, number>> = {};
  for (const name of ['desktop', 'tablet', 'mobile']) {
    if (!present(bps, name)) continue;
    const at = `${path}/${name}`;
    const bp = object(ctx, bps[name], at, ['minWidth', 'stageWidth', 'stageHeight']);
    if (!bp) continue;
    num(ctx, bp, 'minWidth', at, 0, LIMITS.breakpointMax, true);
    num(ctx, bp, 'stageWidth', at, LIMITS.stageMin, LIMITS.stageMax, true);
    num(ctx, bp, 'stageHeight', at, LIMITS.stageHeightMin, LIMITS.stageHeightMax, true);
    if (typeof bp.minWidth === 'number' && Number.isInteger(bp.minWidth)) {
      minWidths[name] = bp.minWidth;
    }
  }
  const { mobile, tablet, desktop } = minWidths;
  if (mobile !== undefined && mobile !== 0) ctx.add(`${path}/mobile/minWidth`, 'breakpoint_order');
  if (mobile !== undefined && tablet !== undefined && tablet <= mobile) {
    ctx.add(`${path}/tablet/minWidth`, 'breakpoint_order');
  }
  if (tablet !== undefined && desktop !== undefined && desktop <= tablet) {
    ctx.add(`${path}/desktop/minWidth`, 'breakpoint_order');
  }
}

function validateSettings(ctx: Context, value: unknown, path: string): void {
  const settings = object(ctx, value, path, [
    'label',
    'layout',
    'maxWidth',
    'autoplay',
    'loop',
    'showArrows',
    'showDots',
  ]);
  if (!settings) return;
  str(ctx, settings, 'label', path, 0, LIMITS.labelLength);
  enumeration(ctx, settings, 'layout', path, ['boxed', 'full']);
  num(ctx, settings, 'maxWidth', path, LIMITS.maxWidthMin, LIMITS.maxWidthMax, true);
  bool(ctx, settings, 'autoplay', path);
  bool(ctx, settings, 'loop', path);
  bool(ctx, settings, 'showArrows', path);
  bool(ctx, settings, 'showDots', path);
}

function validateFontRefs(ctx: Context, doc: Json, path: string): Set<string> {
  const refIds = new Set<string>();
  list(ctx, doc, 'fontRefs', path, 0, LIMITS.fontRefs).forEach((entry, index) => {
    const at = `${path}/fontRefs/${index}`;
    const ref = object(ctx, entry, at, ['id', 'installationId', 'weight', 'style']);
    if (!ref) return;
    id(ctx, ref, 'id', at, false);
    if (typeof ref.id === 'string') {
      if (refIds.has(ref.id)) ctx.add(`${at}/id`, 'duplicate_id');
      refIds.add(ref.id);
    }
    id(ctx, ref, 'installationId', at, false);
    num(ctx, ref, 'weight', at, 100, 900, true);
    if (
      typeof ref.weight === 'number' &&
      Number.isInteger(ref.weight) &&
      ref.weight >= 100 &&
      ref.weight <= 900 &&
      ref.weight % 100 !== 0
    ) {
      ctx.add(`${at}/weight`, 'range');
    }
    enumeration(ctx, ref, 'style', at, ['normal', 'italic']);
  });
  return refIds;
}

const LAYOUT_RULES: Record<string, (ctx: Context, obj: Json, path: string) => void> = {
  x: (ctx, obj, path) => num(ctx, obj, 'x', path, -LIMITS.coordinate, LIMITS.coordinate),
  y: (ctx, obj, path) => num(ctx, obj, 'y', path, -LIMITS.coordinate, LIMITS.coordinate),
  width: (ctx, obj, path) => num(ctx, obj, 'width', path, LIMITS.sizeMin, LIMITS.sizeMax),
  height: (ctx, obj, path) => num(ctx, obj, 'height', path, LIMITS.sizeMin, LIMITS.sizeMax),
  anchorX: (ctx, obj, path) => enumeration(ctx, obj, 'anchorX', path, ['left', 'center', 'right']),
  anchorY: (ctx, obj, path) => enumeration(ctx, obj, 'anchorY', path, ['top', 'center', 'bottom']),
  rotation: (ctx, obj, path) =>
    num(ctx, obj, 'rotation', path, -LIMITS.rotationMax, LIMITS.rotationMax),
  visible: (ctx, obj, path) => bool(ctx, obj, 'visible', path),
};

const STYLE_RULES: Record<string, (ctx: Context, obj: Json, path: string) => void> = {
  fontRef: (ctx, obj, path) => {
    if (present(obj, 'fontRef') && obj.fontRef !== null) id(ctx, obj, 'fontRef', path, false);
  },
  fontSize: (ctx, obj, path) =>
    num(ctx, obj, 'fontSize', path, LIMITS.fontSizeMin, LIMITS.fontSizeMax),
  lineHeight: (ctx, obj, path) =>
    num(ctx, obj, 'lineHeight', path, LIMITS.lineHeightMin, LIMITS.lineHeightMax),
  letterSpacing: (ctx, obj, path) =>
    num(ctx, obj, 'letterSpacing', path, LIMITS.letterSpacingMin, LIMITS.letterSpacingMax),
  color: (ctx, obj, path) => color(ctx, obj, 'color', path, false),
  textAlign: (ctx, obj, path) =>
    enumeration(ctx, obj, 'textAlign', path, ['left', 'center', 'right']),
  backgroundColor: (ctx, obj, path) => color(ctx, obj, 'backgroundColor', path, true),
  borderRadius: (ctx, obj, path) => num(ctx, obj, 'borderRadius', path, 0, LIMITS.radiusMax),
  paddingX: (ctx, obj, path) => num(ctx, obj, 'paddingX', path, 0, LIMITS.paddingMax),
  paddingY: (ctx, obj, path) => num(ctx, obj, 'paddingY', path, 0, LIMITS.paddingMax),
  opacity: (ctx, obj, path) => num(ctx, obj, 'opacity', path, 0, 1),
};

/** Style keys added after the first v1 documents: accepted when absent (defaults in css.ts). */
const OPTIONAL_STYLE_RULES: Record<string, (ctx: Context, obj: Json, path: string) => void> = {
  borderWidth: (ctx, obj, path) => num(ctx, obj, 'borderWidth', path, 0, LIMITS.borderWidthMax),
  borderColor: (ctx, obj, path) => color(ctx, obj, 'borderColor', path, false),
  shadowX: (ctx, obj, path) =>
    num(ctx, obj, 'shadowX', path, -LIMITS.shadowOffsetMax, LIMITS.shadowOffsetMax),
  shadowY: (ctx, obj, path) =>
    num(ctx, obj, 'shadowY', path, -LIMITS.shadowOffsetMax, LIMITS.shadowOffsetMax),
  shadowBlur: (ctx, obj, path) => num(ctx, obj, 'shadowBlur', path, 0, LIMITS.shadowBlurMax),
  shadowColor: (ctx, obj, path) => color(ctx, obj, 'shadowColor', path, true),
  shadowOpacity: (ctx, obj, path) => num(ctx, obj, 'shadowOpacity', path, 0, 1),
};

const LAYOUT_KEY_LIST = Object.keys(LAYOUT_RULES);
const STYLE_KEY_LIST = Object.keys(STYLE_RULES);
const OPTIONAL_STYLE_KEY_LIST = Object.keys(OPTIONAL_STYLE_RULES);
const BUTTON_STATE_KEYS = ['hoverBackgroundColor', 'hoverColor', 'focusOutlineColor'];

function applyRules(
  ctx: Context,
  obj: Json,
  path: string,
  rules: Record<string, (ctx: Context, obj: Json, path: string) => void>,
): void {
  for (const rule of Object.values(rules)) rule(ctx, obj, path);
}

function validatePhase(ctx: Context, obj: Json, path: string): void {
  enumeration(ctx, obj, 'preset', path, ANIMATION_PRESETS);
  num(ctx, obj, 'startMs', path, 0, LIMITS.animationStartMaxMs, true);
  num(ctx, obj, 'durationMs', path, 0, LIMITS.animationDurationMaxMs, true);
  enumeration(ctx, obj, 'easing', path, EASINGS);
  num(ctx, obj, 'distance', path, 0, LIMITS.animationDistanceMax);
}

const PHASE_KEYS = ['preset', 'startMs', 'durationMs', 'easing', 'distance'];

function validAnimationNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function validateAnimation(ctx: Context, value: unknown, path: string): void {
  const animation = object(ctx, value, path, ['enter', 'exit']);
  if (!animation) return;
  let enterEnd: number | null = null;
  if (present(animation, 'enter')) {
    const enter = object(ctx, animation.enter, `${path}/enter`, PHASE_KEYS);
    if (enter) {
      validatePhase(ctx, enter, `${path}/enter`);
      if (validAnimationNumber(enter.startMs) && validAnimationNumber(enter.durationMs)) {
        enterEnd = enter.startMs + enter.durationMs;
      }
    }
  }
  if (!present(animation, 'exit')) return;
  const at = `${path}/exit`;
  const raw = animation.exit;
  if (!isObject(raw)) {
    ctx.add(at, 'type');
    return;
  }
  if (raw.mode === 'slide-end') {
    object(ctx, raw, at, ['mode']);
    return;
  }
  if (raw.mode !== 'timed') {
    ctx.add(`${at}/mode`, present(raw, 'mode') ? 'enum' : 'required');
    return;
  }
  const exit = object(ctx, raw, at, ['mode', ...PHASE_KEYS]);
  if (!exit) return;
  validatePhase(ctx, exit, at);
  if (enterEnd !== null && validAnimationNumber(exit.startMs) && exit.startMs < enterEnd) {
    ctx.add(`${at}/startMs`, 'animation_order');
  }
}

function validateOverrides(ctx: Context, value: unknown, path: string): void {
  const overrides = object(ctx, value, path, [], ['tablet', 'mobile']);
  if (!overrides) return;
  for (const name of ['tablet', 'mobile']) {
    if (!present(overrides, name)) continue;
    const at = `${path}/${name}`;
    const override = object(ctx, overrides[name], at, [], ['layout', 'style']);
    if (!override) continue;
    if (present(override, 'layout')) {
      const layout = object(ctx, override.layout, `${at}/layout`, [], LAYOUT_KEY_LIST);
      if (layout) applyRules(ctx, layout, `${at}/layout`, LAYOUT_RULES);
    }
    if (present(override, 'style')) {
      const style = object(ctx, override.style, `${at}/style`, [], OVERRIDABLE_STYLE_KEYS);
      if (style) {
        for (const key of OVERRIDABLE_STYLE_KEYS) STYLE_RULES[key]?.(ctx, style, `${at}/style`);
      }
    }
  }
}

/** Rich text: paragraphs of runs; at least one paragraph, bounded counts and total characters. */
function validateRich(ctx: Context, value: unknown, path: string): void {
  if (!Array.isArray(value)) {
    ctx.add(path, 'type');
    return;
  }
  if (value.length < 1 || value.length > LIMITS.richParagraphs) ctx.add(path, 'count');
  let characters = 0;
  value.forEach((paragraph, index) => {
    const at = `${path}/${index}`;
    const entry = object(ctx, paragraph, at, ['runs']);
    if (!entry) return;
    const runs = list(ctx, entry, 'runs', at, 0, LIMITS.richRunsPerParagraph);
    runs.forEach((run, runIndex) => {
      const runAt = `${at}/runs/${runIndex}`;
      const item = object(ctx, run, runAt, ['text'], ['bold', 'italic', 'link']);
      if (!item) return;
      str(ctx, item, 'text', runAt, 1, LIMITS.textLength);
      if (typeof item.text === 'string') characters += charLength(item.text);
      bool(ctx, item, 'bold', runAt);
      bool(ctx, item, 'italic', runAt);
      if (!present(item, 'link')) return;
      const linkAt = `${runAt}/link`;
      const link = object(ctx, item.link, linkAt, ['url'], ['newTab']);
      if (!link) return;
      str(ctx, link, 'url', linkAt, 1, LIMITS.urlLength);
      if (typeof link.url === 'string' && link.url !== '' && !LINK_PATTERN.test(link.url))
        ctx.add(`${linkAt}/url`, 'url');
      bool(ctx, link, 'newTab', linkAt);
    });
  });
  if (characters > LIMITS.textLength) ctx.add(path, 'length');
}

function validateContent(ctx: Context, type: unknown, value: unknown, path: string): void {
  switch (type) {
    case 'text': {
      const content = object(ctx, value, path, ['text', 'tag'], ['rich']);
      if (!content) return;
      str(ctx, content, 'text', path, 0, LIMITS.textLength);
      enumeration(ctx, content, 'tag', path, TEXT_TAGS);
      if (present(content, 'rich')) validateRich(ctx, content.rich, `${path}/rich`);
      return;
    }
    case 'image': {
      const content = object(
        ctx,
        value,
        path,
        ['attachmentId', 'alt', 'decorative', 'fit'],
        ['linkUrl', 'linkNewTab', 'focalX', 'focalY'],
      );
      if (!content) return;
      num(ctx, content, 'focalX', path, 0, 100);
      num(ctx, content, 'focalY', path, 0, 100);
      str(ctx, content, 'linkUrl', path, 0, LIMITS.urlLength);
      if (
        typeof content.linkUrl === 'string' &&
        content.linkUrl !== '' &&
        !LINK_PATTERN.test(content.linkUrl)
      ) {
        ctx.add(`${path}/linkUrl`, 'url');
      }
      bool(ctx, content, 'linkNewTab', path);
      attachment(ctx, content, 'attachmentId', path);
      str(ctx, content, 'alt', path, 0, LIMITS.altLength);
      bool(ctx, content, 'decorative', path);
      enumeration(ctx, content, 'fit', path, ['cover', 'contain']);
      return;
    }
    case 'button': {
      const content = object(ctx, value, path, ['label', 'url', 'newTab'], BUTTON_STATE_KEYS);
      if (!content) return;
      for (const key of BUTTON_STATE_KEYS) color(ctx, content, key, path, false);
      str(ctx, content, 'label', path, 1, LIMITS.buttonLabelLength);
      str(ctx, content, 'url', path, 1, LIMITS.urlLength);
      if (
        typeof content.url === 'string' &&
        content.url !== '' &&
        !LINK_PATTERN.test(content.url)
      ) {
        ctx.add(`${path}/url`, 'url');
      }
      bool(ctx, content, 'newTab', path);
      return;
    }
    case 'shape': {
      const content = object(ctx, value, path, ['kind']);
      if (!content) return;
      enumeration(ctx, content, 'kind', path, SHAPE_KINDS);
      return;
    }
    default:
      // The layer type itself is reported by validateLayer; content cannot be checked.
      return;
  }
}

function validateLayer(ctx: Context, value: unknown, path: string, fontRefs: Set<string>): void {
  const layer = object(ctx, value, path, [
    'id',
    'type',
    'name',
    'locked',
    'content',
    'layout',
    'style',
    'overrides',
    'animation',
  ]);
  if (!layer) return;
  id(ctx, layer, 'id', path, true);
  enumeration(ctx, layer, 'type', path, LAYER_TYPES);
  str(ctx, layer, 'name', path, 0, LIMITS.nameLength);
  bool(ctx, layer, 'locked', path);
  if (present(layer, 'content')) validateContent(ctx, layer.type, layer.content, `${path}/content`);
  if (present(layer, 'layout')) {
    const layout = object(ctx, layer.layout, `${path}/layout`, LAYOUT_KEY_LIST);
    if (layout) applyRules(ctx, layout, `${path}/layout`, LAYOUT_RULES);
  }
  if (present(layer, 'style')) {
    const style = object(
      ctx,
      layer.style,
      `${path}/style`,
      STYLE_KEY_LIST,
      OPTIONAL_STYLE_KEY_LIST,
    );
    if (style) {
      applyRules(ctx, style, `${path}/style`, STYLE_RULES);
      applyRules(ctx, style, `${path}/style`, OPTIONAL_STYLE_RULES);
      if (
        typeof style.fontRef === 'string' &&
        ID_PATTERN.test(style.fontRef) &&
        !fontRefs.has(style.fontRef)
      ) {
        ctx.add(`${path}/style/fontRef`, 'reference');
      }
    }
  }
  if (present(layer, 'overrides')) validateOverrides(ctx, layer.overrides, `${path}/overrides`);
  if (present(layer, 'animation')) validateAnimation(ctx, layer.animation, `${path}/animation`);
}

function validateSlide(ctx: Context, value: unknown, path: string, fontRefs: Set<string>): void {
  const slide = object(ctx, value, path, [
    'id',
    'name',
    'enabled',
    'durationMs',
    'background',
    'transition',
    'layers',
  ]);
  if (!slide) return;
  id(ctx, slide, 'id', path, true);
  str(ctx, slide, 'name', path, 0, LIMITS.nameLength);
  bool(ctx, slide, 'enabled', path);
  num(ctx, slide, 'durationMs', path, LIMITS.slideDurationMinMs, LIMITS.slideDurationMaxMs, true);
  if (present(slide, 'background')) {
    const at = `${path}/background`;
    const background = object(
      ctx,
      slide.background,
      at,
      ['color', 'attachmentId', 'fit'],
      ['overlayColor', 'overlayOpacity', 'focalX', 'focalY'],
    );
    if (background) {
      color(ctx, background, 'overlayColor', at, true);
      num(ctx, background, 'overlayOpacity', at, 0, 1);
      num(ctx, background, 'focalX', at, 0, 100);
      num(ctx, background, 'focalY', at, 0, 100);
      color(ctx, background, 'color', at, true);
      attachment(ctx, background, 'attachmentId', at);
      enumeration(ctx, background, 'fit', at, ['cover', 'contain']);
    }
  }
  if (present(slide, 'transition')) {
    const at = `${path}/transition`;
    const transition = object(ctx, slide.transition, at, ['type', 'durationMs']);
    if (transition) {
      enumeration(ctx, transition, 'type', at, ['cut', 'fade', 'slide']);
      num(ctx, transition, 'durationMs', at, 0, LIMITS.transitionMaxMs, true);
    }
  }
  list(ctx, slide, 'layers', path, 0, LIMITS.layersPerSlide).forEach((layer, index) => {
    validateLayer(ctx, layer, `${path}/layers/${index}`, fontRefs);
  });
}

/** Type predicate: a value without issues satisfies the SliderDocument contract. */
function conforms(_raw: unknown, issues: readonly ValidationIssue[]): _raw is SliderDocument {
  return issues.length === 0;
}

export function validateDocument(raw: unknown): ValidationResult {
  const issues = collectIssues(raw);
  if (conforms(raw, issues)) return { ok: true, document: raw };
  return { ok: false, issues };
}

export function collectIssues(raw: unknown): ValidationIssue[] {
  const ctx = new Context();
  if (isObject(raw) && present(raw, 'schemaVersion') && raw.schemaVersion !== SCHEMA_VERSION) {
    // Unknown (newer or older) versions are never inspected or silently converted.
    return [{ path: '/schemaVersion', code: 'schema_version' }];
  }
  const doc = object(ctx, raw, '', [
    'schemaVersion',
    'id',
    'settings',
    'breakpoints',
    'fontRefs',
    'slides',
  ]);
  if (doc) {
    id(ctx, doc, 'id', '', false);
    if (present(doc, 'settings')) validateSettings(ctx, doc.settings, '/settings');
    if (present(doc, 'breakpoints')) validateBreakpoints(ctx, doc.breakpoints, '/breakpoints');
    const fontRefs = validateFontRefs(ctx, doc, '');
    list(ctx, doc, 'slides', '', 1, LIMITS.slides).forEach((slide, index) => {
      validateSlide(ctx, slide, `/slides/${index}`, fontRefs);
    });
  }
  if (ctx.issues.length === 0 && canonicalBytes(raw) > LIMITS.documentBytes) {
    return [{ path: '', code: 'too_large' }];
  }
  return ctx.issues;
}
