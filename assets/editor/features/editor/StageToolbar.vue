<script setup lang="ts">
import { computed } from 'vue';
import type { BreakpointName } from '@shared/types';
import { useEditorStore } from '@editor/stores/editor';
import { __, sprintf } from '@editor/i18n';
const editor = useEditorStore();
const devices = computed<Array<{ value: BreakpointName; icon: string; label: string }>>(() => {
  const bps = editor.document?.breakpoints;
  return [
    {
      value: 'desktop',
      icon: 'r_desktop_windows',
      label: sprintf(__('Desktop (from %d px)'), bps?.desktop.minWidth ?? 0),
    },
    {
      value: 'tablet',
      icon: 'r_tablet_mac',
      label: sprintf(
        __('Tablet (%1$d–%2$d px)'),
        bps?.tablet.minWidth ?? 0,
        (bps?.desktop.minWidth ?? 1) - 1,
      ),
    },
    {
      value: 'mobile',
      icon: 'r_smartphone',
      label: sprintf(__('Mobile (below %d px)'), bps?.tablet.minWidth ?? 0),
    },
  ];
});

const zoomOptions = computed(() => [
  { value: 'fit' as const, label: __('Fit') },
  { value: 0.25, label: '25 %' },
  { value: 0.5, label: '50 %' },
  { value: 0.75, label: '75 %' },
  { value: 1, label: '100 %' },
]);
</script>
<template>
  <div class="sws-stage-toolbar">
    <div
      class="sws-topbar__group sws-topbar__devices"
      role="radiogroup"
      :aria-label="__('Edited screen size')"
    >
      <q-btn
        v-for="item in devices"
        :key="item.value"
        flat
        dense
        no-caps
        :icon="item.icon"
        role="radio"
        :aria-checked="editor.device === item.value"
        :aria-label="item.label"
        :class="{ 'sws-topbar__device--active': editor.device === item.value }"
        @click="editor.device = item.value"
      >
        <q-tooltip>{{ item.label }}</q-tooltip>
      </q-btn>
      <q-select
        v-model="editor.zoom"
        :options="zoomOptions"
        emit-value
        map-options
        dense
        borderless
        options-dense
        class="sws-topbar__zoom"
        :aria-label="__('Zoom')"
      />
    </div>

    <span v-if="editor.stage" class="sws-num"
      >{{ editor.stage.stageWidth }} × {{ editor.stage.stageHeight }}</span
    >
  </div>
</template>
<style scoped>
.sws-stage-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 12px;
  min-height: 40px;
  border-bottom: 1px solid var(--sws-border);
  background: var(--sws-surface);
  color: var(--sws-muted);
  font-size: 12px;
}
.sws-topbar__group {
  display: flex;
  align-items: center;
  gap: 2px;
}
.sws-topbar__device--active {
  background: var(--sws-primary-bg);
  color: var(--sws-primary-text);
}
.sws-topbar__zoom {
  width: 90px;
  margin-left: 8px;
}
</style>
