<script setup lang="ts">
import { computed } from 'vue';
import { hasOverride, overrideChain } from '@shared/layout';
import type { Layer } from '@shared/types';
import { useEditorStore } from '@editor/stores/editor';
import { __ } from '@editor/i18n';

/**
 * Shows whether a responsive value is overridden on the edited screen size (with reset) or
 * inherited, and from where (PLAN.md 6: overrides are visible and resettable).
 */
const props = defineProps<{ layer: Layer; group: 'layout' | 'style'; field: string }>();
const editor = useEditorStore();

const overridden = computed(() => hasOverride(props.layer, editor.device, props.group, props.field));
const inheritedFrom = computed(() => {
  if (editor.device === 'desktop' || overridden.value) return null;
  const chain = overrideChain(editor.device).filter((name) => name !== editor.device);
  const source = [...chain].reverse().find((name) => hasOverride(props.layer, name, props.group, props.field));
  return source === 'tablet' ? __('inherited from tablet') : __('inherited from desktop');
});
</script>

<template>
  <span v-if="overridden" class="sws-ov sws-ov--set">
    {{ __('Own value') }}
    <q-btn flat dense round size="xs" icon="r_restart_alt" :aria-label="__('Reset to inherited value')" @click="editor.resetOverride(layer.id, group, field)">
      <q-tooltip>{{ __('Reset to inherited value') }}</q-tooltip>
    </q-btn>
  </span>
  <span v-else-if="inheritedFrom" class="sws-ov">{{ inheritedFrom }}</span>
</template>

<style scoped>
.sws-ov {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: var(--sws-muted);
  white-space: nowrap;
}
.sws-ov--set {
  padding: 0 0 0 8px;
  border-radius: 999px;
  background: var(--sws-warning-bg);
  color: var(--sws-warning-text);
  font-weight: 650;
}
</style>
