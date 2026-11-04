<script setup lang="ts">
import { ref, watch } from 'vue';

/**
 * Percentage slider (e.g. opacity). The value follows the handle live for display, but is only
 * committed when the handle is released or a key press ends, so one gesture is one undo step.
 */
const props = withDefaults(
  defineProps<{ modelValue: number; label: string; min?: number; max?: number; step?: number }>(),
  { min: 0, max: 100, step: 1 },
);
const emit = defineEmits<{ (e: 'commit', value: number): void }>();
const live = ref(props.modelValue);
watch(
  () => props.modelValue,
  (value) => {
    live.value = value;
  },
);

function commit(value: number | null): void {
  if (value === null || value === props.modelValue) return;
  emit('commit', value);
}
</script>

<template>
  <div class="sws-percent">
    <div class="sws-percent__head">
      <span>{{ label }}</span>
      <output class="sws-num">{{ live }} %</output>
    </div>
    <q-slider
      v-model="live"
      :min="min"
      :max="max"
      :step="step"
      :aria-label="label"
      color="primary"
      @change="commit"
    />
  </div>
</template>

<style scoped>
.sws-percent {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.sws-percent__head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--sws-muted);
}
</style>
