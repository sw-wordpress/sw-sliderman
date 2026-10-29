<script setup lang="ts">
import { ref, watch } from 'vue';

/**
 * Numeric input that commits on change/Enter (one undo step per entered value, not per key).
 * Invalid or out-of-range input is not committed; the field shows the current value again.
 */
const props = withDefaults(
  defineProps<{ modelValue: number; label: string; min?: number; max?: number; step?: number; suffix?: string | undefined; integer?: boolean }>(),
  { min: -Infinity, max: Infinity, step: 1, suffix: undefined, integer: false },
);
const emit = defineEmits<{ (e: 'commit', value: number): void }>();
const text = ref(String(props.modelValue));
watch(
  () => props.modelValue,
  (value) => {
    text.value = String(value);
  },
);

function commit(): void {
  const value = Number(String(text.value).replace(',', '.'));
  if (!Number.isFinite(value) || value < props.min || value > props.max || (props.integer && !Number.isInteger(value))) {
    text.value = String(props.modelValue);
    return;
  }
  if (value !== props.modelValue) emit('commit', value);
}
</script>

<template>
  <q-input
    v-model="text"
    dense
    outlined
    inputmode="decimal"
    :label="label"
    :suffix="suffix"
    :rules="[(v: string) => { const n = Number(String(v).replace(',', '.')); return (Number.isFinite(n) && n >= min && n <= max) || `${min} – ${max}`; }]"
    hide-bottom-space
    lazy-rules
    @change="commit"
    @keyup.enter="commit"
  >
    <template v-if="$slots.after" #after><slot name="after" /></template>
  </q-input>
</template>
