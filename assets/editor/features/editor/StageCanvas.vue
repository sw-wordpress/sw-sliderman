<script setup lang="ts">
import { prepareImages } from '../../../browser/images';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { enterKeyframes, exitKeyframes, phaseTiming } from '@shared/animation';
import { focalPosition, layerDeclarations, slideBackgroundCss, styleObject } from '@shared/css';
import { overflowsStage, resolveLayer, resolveLayerLayout, type StageBox } from '@shared/layout';
import { scheduleSlide } from '@shared/schedule';
import type { Layer } from '@shared/types';
import { useEditorStore } from '@editor/stores/editor';
import { __, sprintf } from '@editor/i18n';
import { formatNumber } from '@editor/utils/format';
import { nextMeasurement } from '@editor/utils/measure';
import LayerContent from './LayerContent.vue';
import { useInstalledFonts } from '@editor/composables/useInstalledFonts';

/**
 * The canvas renders the same markup classes and the same CSS declarations (shared/css.ts) as the
 * published slider, inside a `.sws-slider` container of `stageWidth * scale` pixels. Pointer
 * movements are converted back into logical stage pixels; zoom never changes document values.
 */
const editor = useEditorStore();
const scroller = ref<HTMLElement | null>(null);
const stageEl = ref<HTMLElement | null>(null);
const { readyFor } = useInstalledFonts();
const fontsReady = ref(true);
const fontFallback = ref(false);
let fontWait = new AbortController();
watch(
  () =>
    editor.document?.fontRefs
      .map((ref) => `${ref.installationId}|${ref.weight}|${ref.style}`)
      .join(','),
  async () => {
    fontWait.abort();
    fontWait = new AbortController();
    const signal = fontWait.signal;
    fontsReady.value = false;
    const ok = await readyFor(editor.document?.fontRefs ?? [], signal);
    if (!signal.aborted) {
      fontFallback.value = !ok;
      fontsReady.value = true;
    }
  },
  { immediate: true },
);
const available = ref(800);
const availableHeight = ref(500);
const snapToGrid = ref(false);
const GRID = 10;
const SNAP_PX = 6;

let observer: ResizeObserver | null = null;
onMounted(() => {
  if (!scroller.value) return;
  observer = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width;
    const height = entries[0]?.contentRect.height;
    // Ignore sub-pixel jitter to avoid resize/scale feedback loops.
    availableHeight.value = nextMeasurement(availableHeight.value, height);
    available.value = nextMeasurement(available.value, width);
  });
  observer.observe(scroller.value);
});
onBeforeUnmount(() => {
  fontWait.abort();
  observer?.disconnect();
  cancelPreview();
  endPointer();
});

const stage = computed(() => editor.stage ?? { stageWidth: 1440, stageHeight: 600, minWidth: 0 });
const scale = computed(() => {
  const zoom = editor.zoom;
  if (zoom === 'fit')
    return Math.min(
      1,
      Math.max(0.1, available.value / stage.value.stageWidth),
      Math.max(0.1, availableHeight.value / stage.value.stageHeight),
    );
  return zoom;
});
const frameWidth = computed(() => Math.round(stage.value.stageWidth * scale.value));

const resolved = computed(() => {
  const doc = editor.document;
  const slide = editor.slide;
  if (!doc || !slide) return [];
  return slide.layers.map((layer) => {
    const item = resolveLayer(layer, editor.device, doc.breakpoints);
    const css = layerDeclarations(
      item,
      stage.value.stageWidth,
      stage.value.stageHeight,
      doc.fontRefs,
      layer.type === 'shape' ? layer.content.kind : undefined,
    );
    return {
      layer,
      item,
      box: styleObject(css.box),
      body: styleObject(css.body),
      overflow: overflowsStage(item.box, stage.value.stageWidth, stage.value.stageHeight),
    };
  });
});

const background = computed(() => {
  const slide = editor.slide;
  if (!slide) return null;
  const id = slide.background.attachmentId;
  return {
    color: slide.background.color ?? 'transparent',
    image: id !== null ? (editor.media[id]?.url ?? null) : null,
    fit: slide.background.fit,
    position: focalPosition(slide.background.focalX, slide.background.focalY) ?? undefined,
    // Same rules as the published stylesheet (overlay between image and stage).
    css: slideBackgroundCss(`.sws-canvas__frame .sws-sl-${slide.id}`, slide.background),
  };
});

// ---------- pointer interaction ----------
type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
interface PointerState {
  id: number;
  mode: 'move' | 'rotate' | Handle;
  startX: number;
  startY: number;
  boxes: Map<string, StageBox>;
  moved: boolean;
  /** Rotation only: screen centre of the layer, pointer angle and layer rotation at the start. */
  rotation?: { centerX: number; centerY: number; startAngle: number; startValue: number };
}
let pointer: PointerState | null = null;
const guides = ref<{ x: number | null; y: number | null }>({ x: null, y: null });

function startPointer(event: PointerEvent, layer: Layer, mode: PointerState['mode']): void {
  if (event.button !== 0 || !fontsReady.value) return;
  event.stopPropagation();
  if (mode === 'move' && !editor.selectedLayerIds.includes(layer.id)) {
    editor.selectLayer(layer.id, event.shiftKey);
  } else if (mode === 'move' && event.shiftKey) {
    editor.selectLayer(layer.id, true);
    return;
  }
  const targets = mode === 'move' ? editor.selectedLayers : [layer];
  const movable = targets.filter((l) => !l.locked);
  if (movable.length === 0) return;
  const boxes = new Map<string, StageBox>();
  for (const target of movable) {
    const entry = resolved.value.find((r) => r.layer.id === target.id);
    if (entry) boxes.set(target.id, entry.item.box);
  }
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  pointer = {
    id: event.pointerId,
    mode,
    startX: event.clientX,
    startY: event.clientY,
    boxes,
    moved: false,
  };
  editor.beginGesture();
  window.addEventListener('keydown', onEscape, true);
}

const ROTATE_SNAP_DEG = 15;
/** Angle of the pointer around the layer centre in degrees, 0 = straight above the centre. */
function pointerAngle(x: number, y: number, centerX: number, centerY: number): number {
  return (Math.atan2(y - centerY, x - centerX) * 180) / Math.PI + 90;
}

function startRotate(event: PointerEvent, layer: Layer): void {
  if (event.button !== 0 || !fontsReady.value || layer.locked) return;
  event.stopPropagation();
  const handle = event.currentTarget as HTMLElement;
  // The selection frame is not rotated, so its centre is the rotation centre of the layer.
  const frame = handle.parentElement?.getBoundingClientRect();
  if (!frame) return;
  const centerX = frame.left + frame.width / 2;
  const centerY = frame.top + frame.height / 2;
  handle.setPointerCapture(event.pointerId);
  pointer = {
    id: event.pointerId,
    mode: 'rotate',
    startX: event.clientX,
    startY: event.clientY,
    boxes: new Map(),
    moved: false,
    rotation: {
      centerX,
      centerY,
      startAngle: pointerAngle(event.clientX, event.clientY, centerX, centerY),
      // Read from the store, not from the (possibly not yet re-rendered) template prop.
      startValue: resolveLayerLayout(
        editor.slide?.layers.find((item) => item.id === layer.id) ?? layer,
        editor.device,
      ).rotation,
    },
  };
  pointerLayerId = layer.id;
  editor.beginGesture();
  window.addEventListener('keydown', onEscape, true);
}
let pointerLayerId = '';

function snap(value: number, size: number, axis: 'x' | 'y'): number {
  const total = axis === 'x' ? stage.value.stageWidth : stage.value.stageHeight;
  const threshold = SNAP_PX / scale.value;
  // [snapped start position, guide line position]: start edge, centre, end edge of the stage.
  const candidates: Array<[number, number]> = [
    [0, 0],
    [total / 2 - size / 2, total / 2],
    [total - size, total],
  ];
  for (const [position, guide] of candidates) {
    if (Math.abs(value - position) <= threshold) {
      guides.value = { ...guides.value, [axis]: guide };
      return position;
    }
  }
  guides.value = { ...guides.value, [axis]: null };
  return snapToGrid.value ? Math.round(value / GRID) * GRID : value;
}

function onPointerMove(event: PointerEvent): void {
  if (!pointer || event.pointerId !== pointer.id) return;
  if (pointer.mode === 'rotate' && pointer.rotation) {
    const { centerX, centerY, startAngle, startValue } = pointer.rotation;
    const turned = pointerAngle(event.clientX, event.clientY, centerX, centerY) - startAngle;
    let value = startValue + turned;
    if (event.shiftKey) value = Math.round(value / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG;
    pointer.moved = true;
    editor.rotateLayer(pointerLayerId, value);
    return;
  }
  const dx = (event.clientX - pointer.startX) / scale.value;
  const dy = (event.clientY - pointer.startY) / scale.value;
  if (!pointer.moved && Math.hypot(dx, dy) * scale.value < 2) return;
  pointer.moved = true;
  for (const [id, start] of pointer.boxes) {
    let { left, top, width, height } = start;
    if (pointer.mode === 'move') {
      left = pointer.boxes.size === 1 ? snap(start.left + dx, width, 'x') : start.left + dx;
      top = pointer.boxes.size === 1 ? snap(start.top + dy, height, 'y') : start.top + dy;
    } else {
      const mode = pointer.mode;
      if (mode.includes('e')) width = Math.max(8, start.width + dx);
      if (mode.includes('s')) height = Math.max(8, start.height + dy);
      if (mode.includes('w')) {
        width = Math.max(8, start.width - dx);
        left = start.left + start.width - width;
      }
      if (mode.includes('n')) {
        height = Math.max(8, start.height - dy);
        top = start.top + start.height - height;
      }
      if (event.shiftKey && start.height > 0) {
        // Keep the aspect ratio (useful for images).
        const ratio = start.width / start.height;
        if (mode === 'n' || mode === 's') width = height * ratio;
        else height = width / ratio;
      }
    }
    editor.moveLayerBox(
      id,
      { left, top, width, height },
      { position: true, size: pointer.mode !== 'move' },
    );
  }
}

function endPointer(): void {
  if (!pointer) return;
  pointer = null;
  guides.value = { x: null, y: null };
  window.removeEventListener('keydown', onEscape, true);
  editor.endGesture();
}

function onPointerUp(event: PointerEvent): void {
  if (pointer && event.pointerId === pointer.id) endPointer();
}

/** Escape or pointercancel restores the state before the drag. */
function cancelPointer(): void {
  if (!pointer) return;
  pointer = null;
  guides.value = { x: null, y: null };
  window.removeEventListener('keydown', onEscape, true);
  editor.cancelGesture();
}

function onEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    // Capture phase + stopImmediatePropagation: Escape only cancels the drag here and does not
    // also clear the selection through the editor's global shortcut handler.
    event.stopImmediatePropagation();
    cancelPointer();
  }
}

const selectionBoxes = computed(() =>
  resolved.value
    .filter((r) => editor.selectedLayerIds.includes(r.layer.id))
    .map((r) => ({ id: r.layer.id, layer: r.layer, box: r.box })),
);
const handles: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

// ---------- animation preview ----------
const running: Animation[] = [];
let previewResources = new AbortController();
let previewTimer: number | null = null;
function cancelPreview(): void {
  if (previewTimer !== null) window.clearTimeout(previewTimer);
  previewTimer = null;
  previewResources.abort();
  previewResources = new AbortController();
  running.splice(0).forEach((animation) => animation.cancel());
}
watch(
  () => editor.previewToken,
  async () => {
    cancelPreview();
    const signal = previewResources.signal;
    const slide = editor.slide;
    if (!slide || !stageEl.value || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    await Promise.all([
      prepareImages(scroller.value ?? stageEl.value, signal),
      readyFor(editor.document?.fontRefs ?? [], signal),
    ]);
    if (signal.aborted || !stageEl.value) return;
    for (const layer of scheduleSlide(slide).layers) {
      const el = stageEl.value.querySelector<HTMLElement>(
        `[data-sws-layer="${CSS.escape(layer.layerId)}"] .sws-layer__anim`,
      );
      if (!el) continue;
      if (layer.enter)
        running.push(
          el.animate(enterKeyframes(layer.enter, scale.value), phaseTiming(layer.enter, 'enter')),
        );
      if (layer.exit)
        running.push(
          el.animate(exitKeyframes(layer.exit, scale.value), phaseTiming(layer.exit, 'exit')),
        );
    }
    previewTimer = window.setTimeout(cancelPreview, scheduleSlide(slide).durationMs + 100);
  },
);
watch(() => [editor.slide?.id, editor.device], cancelPreview);

const deviceLabel = computed(
  () => ({ desktop: __('Desktop'), tablet: __('Tablet'), mobile: __('Mobile') })[editor.device],
);
</script>

<template>
  <section class="sws-canvas" :aria-label="__('Canvas')" :aria-busy="!fontsReady">
    <p v-if="!fontsReady" class="sws-canvas__hint" role="status">
      {{ __('Loading local fonts …') }}
    </p>
    <p v-else-if="fontFallback" class="sws-canvas__hint" role="status">
      {{ __('Some local fonts could not be loaded. The system font is used.') }}
    </p>
    <div class="sws-canvas__bar">
      <span class="sws-num">
        {{
          sprintf(
            __('%1$s stage %2$d × %3$d px · %4$s %%'),
            deviceLabel,
            stage.stageWidth,
            stage.stageHeight,
            formatNumber(scale * 100, 0),
          )
        }}
      </span>
      <q-toggle v-model="snapToGrid" dense size="sm" :label="sprintf(__('Grid %d px'), GRID)" />
    </div>
    <div ref="scroller" class="sws-canvas__scroller" @pointerdown.self="editor.clearSelection()">
      <div class="sws-slider sws-canvas__frame" :style="{ width: `${frameWidth}px` }">
        <component :is="'style'" v-if="background?.css">{{ background.css }}</component>
        <div
          class="sws-slide sws-is-active"
          :class="`sws-sl-${editor.slide?.id ?? ''}`"
          :style="{ backgroundColor: background?.color }"
        >
          <img
            v-if="background?.image"
            class="sws-slide__bg"
            :class="`sws-fit-${background.fit}`"
            :style="{ objectPosition: background.position }"
            :src="background.image"
            alt=""
          />
          <div
            ref="stageEl"
            class="sws-stage"
            :style="{ aspectRatio: `${stage.stageWidth} / ${stage.stageHeight}` }"
            @pointerdown.self="editor.clearSelection()"
          >
            <div
              v-for="entry in resolved"
              :key="entry.layer.id"
              class="sws-layer sws-canvas__layer"
              :class="[
                `sws-layer--${entry.layer.type}`,
                {
                  'sws-canvas__layer--overflow': entry.overflow,
                  'sws-canvas__layer--locked': entry.layer.locked,
                },
              ]"
              :style="
                entry.item.layout.visible
                  ? entry.box
                  : { ...entry.box, display: 'block', opacity: '0.25' }
              "
              :data-sws-layer="entry.layer.id"
              @pointerdown="startPointer($event, entry.layer, 'move')"
              @pointermove="onPointerMove"
              @pointerup="onPointerUp"
              @pointercancel="cancelPointer"
            >
              <div class="sws-layer__anim">
                <div class="sws-layer__body" :style="entry.body">
                  <LayerContent :layer="entry.layer" />
                </div>
              </div>
            </div>

            <div
              v-for="sel in selectionBoxes"
              :key="`sel-${sel.id}`"
              class="sws-canvas__selection"
              :style="sel.box"
              aria-hidden="true"
            >
              <template v-if="selectionBoxes.length === 1 && !sel.layer.locked">
                <span
                  class="sws-canvas__rotate"
                  :title="__('Rotate (Shift: 15° steps)')"
                  @pointerdown="startRotate($event, sel.layer)"
                  @pointermove="onPointerMove"
                  @pointerup="onPointerUp"
                  @pointercancel="cancelPointer"
                />
                <span
                  v-for="handle in handles"
                  :key="handle"
                  class="sws-canvas__handle"
                  :class="`sws-canvas__handle--${handle}`"
                  @pointerdown="startPointer($event, sel.layer, handle)"
                  @pointermove="onPointerMove"
                  @pointerup="onPointerUp"
                  @pointercancel="cancelPointer"
                />
              </template>
            </div>
            <div
              v-if="guides.x !== null"
              class="sws-canvas__guide sws-canvas__guide--v"
              :style="{ left: `${(guides.x / stage.stageWidth) * 100}%` }"
            />
            <div
              v-if="guides.y !== null"
              class="sws-canvas__guide sws-canvas__guide--h"
              :style="{ top: `${(guides.y / stage.stageHeight) * 100}%` }"
            />
          </div>
        </div>
      </div>
    </div>
    <p class="sws-canvas__hint">
      {{
        __(
          'Drag to move, handles to resize (Shift keeps the ratio), the round handle rotates (Shift: 15° steps), arrow keys move by 1 px (Shift: 10 px), Esc cancels.',
        )
      }}
    </p>
  </section>
</template>

<style scoped>
.sws-canvas {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.sws-canvas__bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--sws-muted);
}
.sws-canvas__scroller {
  overflow: auto;
  padding: 16px;
  border-radius: var(--sws-radius);
  border: 1px solid var(--sws-border);
  background:
    conic-gradient(
        var(--sws-surface-3) 25%,
        transparent 0 50%,
        var(--sws-surface-3) 0 75%,
        transparent 0
      )
      0 0 / 20px 20px,
    var(--sws-surface-2);
}
.sws-canvas__frame {
  margin: 0 auto;
  box-shadow: var(--sws-shadow-2);
  user-select: none;
  touch-action: none;
}
.sws-canvas__frame .sws-slide {
  overflow: visible;
}
.sws-canvas__layer {
  cursor: move;
}
.sws-canvas__layer--locked {
  cursor: default;
}
.sws-canvas__layer--overflow {
  outline: 2px dashed var(--sws-danger);
  outline-offset: -1px;
}
.sws-canvas__selection {
  position: absolute;
  pointer-events: none;
  outline: 2px solid var(--sws-primary);
  outline-offset: 0;
  z-index: 5;
}
.sws-canvas__handle {
  position: absolute;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border-radius: 3px;
  border: 2px solid var(--sws-primary);
  background: #fff;
  pointer-events: auto;
}
.sws-canvas__rotate {
  position: absolute;
  left: 50%;
  top: -28px;
  width: 14px;
  height: 14px;
  margin-left: -7px;
  border-radius: 50%;
  border: 2px solid var(--sws-primary);
  background: #fff;
  cursor: grab;
  pointer-events: auto;
}
.sws-canvas__rotate::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  width: 1px;
  height: 14px;
  background: var(--sws-primary);
}
.sws-canvas__handle--nw {
  left: 0;
  top: 0;
  cursor: nwse-resize;
}
.sws-canvas__handle--n {
  left: 50%;
  top: 0;
  cursor: ns-resize;
}
.sws-canvas__handle--ne {
  left: 100%;
  top: 0;
  cursor: nesw-resize;
}
.sws-canvas__handle--e {
  left: 100%;
  top: 50%;
  cursor: ew-resize;
}
.sws-canvas__handle--se {
  left: 100%;
  top: 100%;
  cursor: nwse-resize;
}
.sws-canvas__handle--s {
  left: 50%;
  top: 100%;
  cursor: ns-resize;
}
.sws-canvas__handle--sw {
  left: 0;
  top: 100%;
  cursor: nesw-resize;
}
.sws-canvas__handle--w {
  left: 0;
  top: 50%;
  cursor: ew-resize;
}
.sws-canvas__guide {
  position: absolute;
  z-index: 6;
  pointer-events: none;
  background: #ec4899;
}
.sws-canvas__guide--v {
  top: 0;
  bottom: 0;
  width: 1px;
}
.sws-canvas__guide--h {
  left: 0;
  right: 0;
  height: 1px;
}
.sws-canvas__hint {
  font-size: 12px;
  color: var(--sws-muted);
}
</style>

<style scoped>
.sws-canvas {
  gap: 0;
}
.sws-canvas__bar {
  padding: 4px 12px;
  font-size: 11px;
  border-bottom: 1px solid var(--sws-border);
}
.sws-canvas__scroller {
  flex: 1;
  min-height: 0;
  border: 0;
  border-radius: 0;
  padding: 24px;
  background: var(--sws-surface-2);
  align-content: center;
}
.sws-canvas__hint {
  padding: 5px 12px;
  margin: 0;
  font-size: 11px;
  border-top: 1px solid var(--sws-border);
}
</style>
