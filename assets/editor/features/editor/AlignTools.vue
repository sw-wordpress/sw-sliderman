<script setup lang="ts">
import { computed } from 'vue';
import { useEditorStore } from '@editor/stores/editor';
import { __ } from '@editor/i18n';
import type { AlignMode } from '@editor/document/ops';

const editor = useEditorStore();
const count = computed(() => editor.selectedLayers.filter((l) => !l.locked).length);
const aligns = computed<Array<{ mode: AlignMode; icon: string; label: string }>>(() => [
  { mode: 'left', icon: 'r_align_horizontal_left', label: __('Align layers left') },
  { mode: 'center', icon: 'r_align_horizontal_center', label: __('Align horizontal centre') },
  { mode: 'right', icon: 'r_align_horizontal_right', label: __('Align layers right') },
  { mode: 'top', icon: 'r_align_vertical_top', label: __('Align top') },
  { mode: 'middle', icon: 'r_align_vertical_center', label: __('Align vertical centre') },
  { mode: 'bottom', icon: 'r_align_vertical_bottom', label: __('Align bottom') },
]);
</script>

<template>
  <div class="sws-align" role="group" :aria-label="__('Align and distribute')">
    <q-btn
      v-for="item in aligns"
      :key="item.mode"
      flat
      dense
      round
      size="sm"
      :icon="item.icon"
      :aria-label="item.label"
      :disable="count === 0"
      @click="editor.alignSelected(item.mode)"
    >
      <q-tooltip>{{ item.label }}</q-tooltip>
    </q-btn>
    <span class="sws-align__sep" aria-hidden="true"></span>
    <q-btn
      flat
      dense
      round
      size="sm"
      icon="r_align_space_even"
      :aria-label="__('Distribute horizontally')"
      :disable="count < 3"
      @click="editor.distributeSelected('horizontal')"
    >
      <q-tooltip>{{ __('Distribute horizontally') }}</q-tooltip>
    </q-btn>
    <q-btn
      flat
      dense
      round
      size="sm"
      icon="r_vertical_distribute"
      :aria-label="__('Distribute vertically')"
      :disable="count < 3"
      @click="editor.distributeSelected('vertical')"
    >
      <q-tooltip>{{ __('Distribute vertically') }}</q-tooltip>
    </q-btn>
  </div>
</template>

<style scoped>
.sws-align {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  padding: 4px;
  border-radius: 999px;
  background: var(--sws-surface-3);
  align-self: flex-start;
}
.sws-align__sep {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: var(--sws-border);
}
</style>
