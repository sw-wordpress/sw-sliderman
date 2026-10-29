<script setup lang="ts">
import { computed } from 'vue';
import { useEditorStore } from '@editor/stores/editor';
import { __, sprintf } from '@editor/i18n';
import { describeIssue } from './issues';

const editor = useEditorStore();
const visibleIssues = computed(() => editor.issues.slice(0, 5));

function download(): void {
  const blob = new Blob([editor.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `slider-${editor.sliderId}-local.json`;
  link.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div v-if="editor.saveState === 'conflict'" class="sws-notice sws-notice--danger" role="alert">
    <q-icon name="r_sync_problem" size="22px" aria-hidden="true" />
    <div>
      <strong>{{ __('This slider was changed elsewhere.') }}</strong>
      <p>
        {{
          sprintf(
            __('Your version is based on revision %1$d, the server has revision %2$d. Nothing was overwritten.'),
            editor.serverVersion,
            editor.conflictVersion ?? 0,
          )
        }}
      </p>
    </div>
    <div class="sws-notice__actions">
      <q-btn outline no-caps icon="r_download" :label="__('Export my changes')" @click="download" />
      <q-btn unelevated no-caps color="negative" icon="r_refresh" :label="__('Discard and reload')" @click="editor.reloadFromServer()" />
    </div>
  </div>

  <div v-if="editor.recovered" class="sws-notice sws-notice--info" role="status">
    <q-icon name="r_restore" size="22px" aria-hidden="true" />
    <div>
      <strong>{{ __('Unsaved changes found in this browser.') }}</strong>
      <p>{{ __('They are based on the current server version and can be restored.') }}</p>
    </div>
    <div class="sws-notice__actions">
      <q-btn flat no-caps :label="__('Discard')" @click="editor.discardRecovered()" />
      <q-btn unelevated no-caps color="primary" :label="__('Restore')" @click="editor.restoreRecovered()" />
    </div>
  </div>

  <div v-if="editor.saveState === 'error' && editor.saveError" class="sws-notice sws-notice--danger" role="alert">
    <q-icon name="r_cloud_off" size="22px" aria-hidden="true" />
    <div>
      <strong>{{ __('Saving failed.') }}</strong>
      <p>{{ editor.saveError }} {{ __('Your changes are kept in this browser.') }}</p>
    </div>
    <div class="sws-notice__actions">
      <q-btn unelevated no-caps color="primary" :label="__('Try again')" @click="editor.save()" />
    </div>
  </div>

  <div v-if="editor.issues.length > 0" class="sws-notice sws-notice--warn" role="status">
    <q-icon name="r_rule" size="22px" aria-hidden="true" />
    <div>
      <strong>{{ __('Some values are not valid and prevent saving or publishing:') }}</strong>
      <ul>
        <li v-for="issue in visibleIssues" :key="issue.path + issue.code">{{ describeIssue(issue, editor.document) }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.sws-notice {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
  padding: 12px 16px;
  border-radius: var(--sws-radius-sm);
  border: 1px solid transparent;
  font-size: 14px;
}
.sws-notice > div:nth-child(2) {
  flex: 1 1 280px;
}
.sws-notice p,
.sws-notice ul {
  margin-top: 2px;
}
.sws-notice ul {
  list-style: disc;
  padding-left: 18px;
}
.sws-notice--danger {
  background: var(--sws-danger-bg);
  color: var(--sws-danger-text);
}
.sws-notice--warn {
  background: var(--sws-warning-bg);
  color: var(--sws-warning-text);
}
.sws-notice--info {
  background: var(--sws-info-bg);
  color: var(--sws-info-text);
}
.sws-notice__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
