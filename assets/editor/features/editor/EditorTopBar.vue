<script setup lang="ts">
import { computed } from 'vue';
import { useQuasar } from 'quasar';
import type { BreakpointName } from '@shared/types';
import { useEditorStore } from '@editor/stores/editor';
import { can } from '@editor/config';
import { __, sprintf } from '@editor/i18n';
import { formatGmt } from '@editor/utils/format';
import CopyButton from '@editor/components/ui/CopyButton.vue';

const editor = useEditorStore();
const $q = useQuasar();

const devices = computed<Array<{ value: BreakpointName; icon: string; label: string }>>(() => {
  const bps = editor.document?.breakpoints;
  return [
    { value: 'desktop', icon: 'r_desktop_windows', label: sprintf(__('Desktop (from %d px)'), bps?.desktop.minWidth ?? 0) },
    { value: 'tablet', icon: 'r_tablet_mac', label: sprintf(__('Tablet (%1$d–%2$d px)'), bps?.tablet.minWidth ?? 0, (bps?.desktop.minWidth ?? 1) - 1) },
    { value: 'mobile', icon: 'r_smartphone', label: sprintf(__('Mobile (below %d px)'), bps?.tablet.minWidth ?? 0) },
  ];
});

const status = computed(() => {
  switch (editor.saveState) {
    case 'saved':
      return { icon: 'r_cloud_done', text: __('All changes saved'), tone: 'ok' };
    case 'dirty':
      return { icon: 'r_edit_note', text: __('Unsaved changes'), tone: 'warn' };
    case 'saving':
      return { icon: 'r_sync', text: __('Saving …'), tone: 'busy' };
    case 'invalid':
      return { icon: 'r_error', text: __('Check the marked values'), tone: 'error' };
    case 'conflict':
      return { icon: 'r_sync_problem', text: __('Version conflict'), tone: 'error' };
    default:
      return { icon: 'r_cloud_off', text: __('Saving failed'), tone: 'error' };
  }
});

const publishState = computed(() => {
  const published = editor.published;
  if (!published) return __('Not published');
  if (published.version === editor.serverVersion && editor.saveState === 'saved') {
    return sprintf(__('Published %s'), formatGmt(published.publishedGmt));
  }
  return __('Published version is older than this draft');
});

const zoomOptions = computed(() => [
  { value: 'fit' as const, label: __('Fit') },
  { value: 0.25, label: '25 %' },
  { value: 0.5, label: '50 %' },
  { value: 0.75, label: '75 %' },
  { value: 1, label: '100 %' },
]);

async function publish(): Promise<void> {
  const ok = await editor.publish();
  $q.notify(
    ok
      ? { type: 'positive', message: __('The slider is published.') }
      : { type: 'negative', message: editor.saveError ?? __('Publishing failed. The live version was not changed.') },
  );
}
</script>

<template>
  <header class="sws-topbar">
    <div class="sws-topbar__title">
      <q-btn flat round dense icon="r_arrow_back" to="/" :aria-label="__('Back to the slider list')" />
      <q-input
        :model-value="editor.title"
        dense
        borderless
        maxlength="200"
        class="sws-topbar__name"
        :aria-label="__('Slider name')"
        @update:model-value="(v) => editor.setTitle(String(v ?? ''))"
      />
      <span class="sws-topbar__status" :class="`sws-topbar__status--${status.tone}`" role="status">
        <q-icon :name="status.icon" size="18px" aria-hidden="true" />{{ status.text }}
      </span>
    </div>

    <div class="sws-topbar__group" role="group" :aria-label="__('History')">
      <q-btn flat round dense icon="r_undo" :disable="!editor.canUndo" :aria-label="__('Undo')" @click="editor.undo()">
        <q-tooltip>{{ __('Undo') }} (Ctrl+Z)</q-tooltip>
      </q-btn>
      <q-btn flat round dense icon="r_redo" :disable="!editor.canRedo" :aria-label="__('Redo')" @click="editor.redo()">
        <q-tooltip>{{ __('Redo') }} (Ctrl+Y)</q-tooltip>
      </q-btn>
    </div>

    <div class="sws-topbar__group sws-topbar__devices" role="radiogroup" :aria-label="__('Edited screen size')">
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

    <div class="sws-topbar__group sws-topbar__actions">
      <q-btn flat no-caps icon="r_play_arrow" :label="__('Preview')" @click="editor.playPreview()">
        <q-tooltip>{{ __('Play the animations of this slide') }}</q-tooltip>
      </q-btn>
      <span class="sws-topbar__code">
        <code>{{ editor.shortcode }}</code>
        <CopyButton :value="editor.shortcode" :label="__('Copy embed code')" />
      </span>
      <q-btn
        outline
        no-caps
        color="primary"
        icon="r_save"
        :label="__('Save')"
        :loading="editor.saveState === 'saving'"
        :disable="editor.saveState === 'saved' || editor.saveState === 'conflict'"
        @click="editor.save()"
      />
      <q-btn
        v-if="can('sws_publish_sliders')"
        unelevated
        no-caps
        color="primary"
        icon="r_rocket_launch"
        :label="__('Publish')"
        :loading="editor.publishing"
        :disable="editor.saveState === 'conflict'"
        @click="publish"
      >
        <q-tooltip>{{ publishState }}</q-tooltip>
      </q-btn>
    </div>
  </header>
</template>

<style scoped>
.sws-topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  padding: 8px 12px;
  background: var(--sws-surface);
  border: 1px solid var(--sws-border);
  border-radius: var(--sws-radius);
  box-shadow: var(--sws-shadow-1);
}
.sws-topbar__title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 320px;
  min-width: 0;
}
.sws-topbar__name {
  flex: 1;
  min-width: 120px;
  font-size: 17px;
  font-weight: 700;
}
.sws-topbar__status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  white-space: nowrap;
  color: var(--sws-muted);
}
.sws-topbar__status--warn {
  color: var(--sws-warning-text);
}
.sws-topbar__status--error {
  color: var(--sws-danger-text);
}
.sws-topbar__status--ok {
  color: var(--sws-success-text);
}
.sws-topbar__group {
  display: flex;
  align-items: center;
  gap: 4px;
}
.sws-topbar__device--active {
  background: var(--sws-primary-bg);
  color: var(--sws-primary-text);
}
.sws-topbar__zoom {
  width: 116px;
  margin-left: 6px;
}
.sws-topbar__code {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
}
@media (max-width: 1360px) {
  .sws-topbar__code {
    display: none;
  }
}
</style>
