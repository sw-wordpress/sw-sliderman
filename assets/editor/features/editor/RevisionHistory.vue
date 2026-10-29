<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useQuasar } from 'quasar';
import { sliders } from '@editor/api';
import type { SliderRevision } from '@editor/api/sliders';
import { useEditorStore } from '@editor/stores/editor';
import { __ } from '@editor/i18n';
import { formatGmt } from '@editor/utils/format';
const editor = useEditorStore();
const $q = useQuasar();
const open = ref(false);
const loading = ref(false);
const restoring = ref(false);
const revisions = ref<SliderRevision[]>([]);
const error = ref('');
let generation = 0;
onBeforeUnmount(() => {
  generation++;
});
async function show(): Promise<void> {
  const request = ++generation;
  open.value = true;
  loading.value = true;
  error.value = '';
  try {
    const result = await sliders.revisions(editor.sliderId);
    if (request === generation) revisions.value = result;
  } catch (e) {
    if (request === generation) error.value = e instanceof Error ? e.message : String(e);
  } finally {
    if (request === generation) loading.value = false;
  }
}
function confirm(revision: SliderRevision): void {
  $q.dialog({
    title: __('Restore revision?'),
    message: __(
      'The current changes are saved first. The revision becomes a new draft; the published slider stays unchanged.',
    ),
    cancel: true,
    ok: { label: __('Restore'), color: 'primary', noCaps: true },
  }).onOk(() => {
    void restore(revision);
  });
}
async function restore(revision: SliderRevision): Promise<void> {
  const request = ++generation;
  const id = editor.sliderId;
  restoring.value = true;
  error.value = '';
  try {
    await editor.save();
    if (request !== generation || id !== editor.sliderId) return;
    if (editor.dirty) {
      error.value = __('Save the current changes before restoring a revision.');
      return;
    }
    editor.cancelAutosave();
    await sliders.restore(id, revision.id, editor.serverVersion);
    if (request !== generation || id !== editor.sliderId) return;
    await editor.load(id);
    open.value = false;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    restoring.value = false;
  }
}
</script>
<template>
  <q-btn flat dense round icon="r_history" :aria-label="__('Revisions')" @click="show"
    ><q-tooltip>{{ __('Revisions') }}</q-tooltip></q-btn
  >
  <q-dialog v-model="open" :persistent="restoring">
    <q-card style="width: 520px; max-width: 92vw">
      <q-card-section
        ><h2 style="font-size: 18px">{{ __('Revisions') }}</h2></q-card-section
      >
      <q-card-section style="max-height: 60vh; overflow: auto">
        <q-spinner v-if="loading" color="primary" />
        <p v-if="error" role="alert">{{ error }}</p>
        <p v-if="!loading && !error && !revisions.length">{{ __('No revisions yet.') }}</p>
        <q-list v-if="!loading" separator>
          <q-item v-for="revision in revisions" :key="revision.id">
            <q-item-section
              ><q-item-label>{{ revision.title }}</q-item-label
              ><q-item-label caption
                >{{ formatGmt(revision.modifiedGmt) }} · #{{ revision.id }}
                {{ revision.autosave ? __('Autosave') : '' }}</q-item-label
              ></q-item-section
            >
            <q-item-section side
              ><q-btn
                flat
                no-caps
                :label="__('Restore')"
                :disable="restoring"
                @click="confirm(revision)"
            /></q-item-section>
          </q-item>
        </q-list>
      </q-card-section>
      <q-card-actions align="right"
        ><q-btn v-close-popup flat no-caps :label="__('Close')" :disable="restoring"
      /></q-card-actions>
    </q-card>
  </q-dialog>
</template>
