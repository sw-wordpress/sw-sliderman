<script setup lang="ts">
import { ref } from 'vue';
import { __ } from '@editor/i18n';
import NumberField from './NumberField.vue';

/**
 * Focal point of an image in percent (0–100). Click or drag on the preview to set it; the value
 * is committed when the pointer is released (one undo step per gesture), the numeric fields
 * commit on change. While dragging only the local marker moves.
 */
const props = defineProps<{ src: string | null; x: number; y: number }>();
const emit = defineEmits<{ (e: 'commit', point: { x: number; y: number }): void }>();

const frame = ref<HTMLElement | null>(null);
const dragging = ref<{ x: number; y: number } | null>(null);

function pointAt(event: PointerEvent): { x: number; y: number } | null {
  const rect = frame.value?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const clamp = (value: number): number => Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100),
  };
}
function down(event: PointerEvent): void {
  const point = pointAt(event);
  if (!point) return;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  dragging.value = point;
}
function move(event: PointerEvent): void {
  if (!dragging.value) return;
  dragging.value = pointAt(event) ?? dragging.value;
}
function up(): void {
  const point = dragging.value;
  dragging.value = null;
  if (point && (point.x !== props.x || point.y !== props.y)) emit('commit', point);
}
function shown(): { x: number; y: number } {
  return dragging.value ?? { x: props.x, y: props.y };
}
</script>

<template>
  <div class="sws-focal">
    <div v-if="src" ref="frame" class="sws-focal__frame" :aria-label="__('Focal point preview')">
      <img :src="src" alt="" draggable="false" class="sws-focal__img" />
      <div
        class="sws-focal__hit"
        data-testid="focal-hit"
        @pointerdown.prevent="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="dragging = null"
      ></div>
      <span
        class="sws-focal__marker"
        aria-hidden="true"
        :style="{ left: `${shown().x}%`, top: `${shown().y}%` }"
      ></span>
    </div>
    <div class="sws-focal__fields">
      <NumberField
        :model-value="x"
        :label="__('Focal point X')"
        suffix="%"
        :min="0"
        :max="100"
        @commit="(v) => emit('commit', { x: v, y })"
      />
      <NumberField
        :model-value="y"
        :label="__('Focal point Y')"
        suffix="%"
        :min="0"
        :max="100"
        @commit="(v) => emit('commit', { x, y: v })"
      />
    </div>
  </div>
</template>

<style scoped>
.sws-focal {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sws-focal__frame {
  position: relative;
  align-self: flex-start;
  max-width: 100%;
  line-height: 0;
  border: 1px solid var(--sws-border);
  border-radius: var(--sws-radius-sm);
  overflow: hidden;
}
.sws-focal__img {
  display: block;
  max-width: 100%;
  max-height: 160px;
}
.sws-focal__hit {
  position: absolute;
  inset: 0;
  cursor: crosshair;
  touch-action: none;
}
.sws-focal__marker {
  position: absolute;
  width: 16px;
  height: 16px;
  margin: -8px 0 0 -8px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--sws-primary);
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.5);
  pointer-events: none;
}
.sws-focal__fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
</style>
