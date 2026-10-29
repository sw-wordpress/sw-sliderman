<script setup lang="ts">
import { computed } from 'vue';
import { useQuasar } from 'quasar';
import { useEditorStore } from '@editor/stores/editor';
import { can } from '@editor/config';
import { __, sprintf } from '@editor/i18n';
import { formatGmt } from '@editor/utils/format';
import SlidesPanel from './SlidesPanel.vue';
import RevisionHistory from './RevisionHistory.vue';
import CopyButton from '@editor/components/ui/CopyButton.vue';

const editor = useEditorStore();
const $q = useQuasar();

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

async function publish(): Promise<void> {
  const ok = await editor.publish();
  $q.notify(
    ok
      ? { type: 'positive', message: __('The slider is published.') }
      : {
          type: 'negative',
          message: editor.saveError ?? __('Publishing failed. The live version was not changed.'),
        },
  );
}
</script>

<template>
  <header class="sws-topbar">
    <div class="sws-topbar__title">
      <q-btn
        flat
        round
        dense
        icon="r_arrow_back"
        to="/"
        :aria-label="__('Back to the slider list')"
      />
      <q-input
        :model-value="editor.title"
        dense
        borderless
        maxlength="200"
        class="sws-topbar__name"
        :aria-label="__('Slider name')"
        @update:model-value="(v) => editor.setTitle(String(v ?? ''))"
      />
      <q-btn
        flat
        dense
        no-caps
        icon-right="r_expand_more"
        class="sws-topbar__slides"
        :label="editor.slide?.name ?? __('Slides')"
      >
        <q-menu><SlidesPanel style="width: 340px; max-width: 90vw" /></q-menu>
      </q-btn>
      <span class="sws-topbar__status" :class="`sws-topbar__status--${status.tone}`" role="status">
        <q-icon :name="status.icon" size="18px" aria-hidden="true" />{{ status.text }}
      </span>
    </div>

    <div class="sws-topbar__group" role="group" :aria-label="__('History')">
      <q-btn
        flat
        round
        dense
        icon="r_undo"
        :disable="!editor.canUndo"
        :aria-label="__('Undo')"
        @click="editor.undo()"
      >
        <q-tooltip>{{ __('Undo') }} (Ctrl+Z)</q-tooltip>
      </q-btn>
      <q-btn
        flat
        round
        dense
        icon="r_redo"
        :disable="!editor.canRedo"
        :aria-label="__('Redo')"
        @click="editor.redo()"
      >
        <q-tooltip>{{ __('Redo') }} (Ctrl+Y)</q-tooltip>
      </q-btn>
    </div>

    <div class="sws-topbar__group sws-topbar__actions">
      <RevisionHistory />
      <q-btn
        v-if="editor.previewUrl"
        flat
        dense
        round
        icon="r_open_in_new"
        :href="editor.previewUrl"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="__('Open saved draft preview')"
        ><q-tooltip>{{ __('Open saved draft preview') }}</q-tooltip></q-btn
      >
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
  gap: 4px 10px;
  padding: 6px 12px;
  background: var(--sws-surface);
  border: 1px solid var(--sws-border);
  border-radius: 0;
  box-shadow: none;
}
.sws-topbar__title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 220px;
  min-width: 0;
}
.sws-topbar__name {
  flex: 1;
  min-width: 70px;
  max-width: 200px;
  font-size: 14px;
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

<style scoped>
.sws-topbar__actions :deep(.q-btn) {
  min-height: 32px;
  font-size: 12px;
  padding: 4px 10px;
}
.sws-topbar__slides {
  max-width: 180px;
}
@media (max-width: 1400px) {
  .sws-topbar__status {
    max-width: 22px;
    overflow: hidden;
  }
  .sws-topbar__status .q-icon {
    flex: none;
  }
}
</style>
