<script setup lang="ts">
import { computed } from 'vue';
import type { BreakpointName } from '@shared/types';
import { useEditorStore } from '@editor/stores/editor';
import { __, sprintf } from '@editor/i18n';
import { PREVIEW_MAX, PREVIEW_MIN, previewInfo } from '@editor/utils/preview';
import type { Diagnostic } from '@shared/diagnostics';
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

const zoomOptions = computed(() => {
  const options: Array<{ value: 'fit' | number; label: string }> = [
    { value: 'fit', label: __('Fit') },
    { value: 0.25, label: '25 %' },
    { value: 0.5, label: '50 %' },
    { value: 0.75, label: '75 %' },
    { value: 1, label: '100 %' },
  ];
  const zoom = editor.zoom;
  // A preview width yields arbitrary zoom values; keep them selectable and readable.
  if (typeof zoom === 'number' && !options.some((option) => option.value === zoom))
    options.push({ value: zoom, label: `${Math.round(zoom * 100)} %` });
  return options;
});

const previewWidth = computed(() =>
  editor.stage && typeof editor.zoom === 'number'
    ? Math.round(editor.stage.stageWidth * editor.zoom)
    : null,
);
const previewText = computed(() => {
  const doc = editor.document;
  if (!doc || previewWidth.value === null) return null;
  const size = editor.selectedLayer?.style.fontSize ?? 16;
  const info = previewInfo(doc.breakpoints, previewWidth.value, size);
  return sprintf(
    __('Active range: %1$s · scale %2$s % · %3$d px text renders as %4$s px'),
    devices.value.find((d) => d.value === info.breakpoint)?.label.split(' (')[0] ?? info.breakpoint,
    String(Math.round(info.scale * 100)),
    size,
    String(info.renderedFontSize),
  );
});
function onPreviewWidth(value: string | number | null): void {
  const width = Number(value);
  if (value !== null && value !== '' && Number.isFinite(width)) editor.setPreviewWidth(width);
}

function describe(item: Diagnostic): string {
  const slide = editor.document?.slides.find((s) => s.id === item.slideId);
  const layer = slide?.layers.find((l) => l.id === item.layerId);
  const where = sprintf(
    __('“%1$s” on “%2$s” (%3$s)'),
    layer?.name ?? '',
    slide?.name ?? '',
    item.breakpoint,
  );
  return item.code === 'overflow'
    ? sprintf(__('%s extends beyond the stage.'), where)
    : sprintf(
        __('%1$s: text renders at only %2$s px on small screens.'),
        where,
        String(item.value ?? 0),
      );
}
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

    <q-input
      :model-value="previewWidth"
      type="number"
      dense
      outlined
      class="sws-stage-toolbar__width"
      :label="__('Preview width (px)')"
      :min="PREVIEW_MIN"
      :max="PREVIEW_MAX"
      debounce="400"
      @update:model-value="onPreviewWidth"
    />
    <span v-if="previewText" class="sws-stage-toolbar__info">{{ previewText }}</span>

    <q-btn
      flat
      dense
      no-caps
      :icon="editor.diagnostics.length ? 'r_warning' : 'r_check_circle'"
      :color="editor.diagnostics.length ? 'warning' : undefined"
      :label="sprintf(__('Checks (%d)'), editor.diagnostics.length)"
    >
      <q-menu>
        <q-list dense class="sws-stage-toolbar__checks">
          <q-item v-if="editor.diagnostics.length === 0">
            <q-item-section>{{ __('No layout problems found.') }}</q-item-section>
          </q-item>
          <q-item
            v-for="item in editor.diagnostics"
            :key="`${item.layerId}-${item.breakpoint}-${item.code}`"
            v-close-popup
            clickable
            @click="editor.focusDiagnostic(item)"
          >
            <q-item-section>{{ describe(item) }}</q-item-section>
          </q-item>
        </q-list>
      </q-menu>
    </q-btn>

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
.sws-stage-toolbar__width {
  width: 150px;
}
.sws-stage-toolbar__info {
  max-width: 340px;
}
.sws-stage-toolbar__checks {
  max-width: 420px;
}
.sws-topbar__zoom {
  width: 90px;
  margin-left: 8px;
}
</style>
