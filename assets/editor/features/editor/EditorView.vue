<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useQuasar } from 'quasar';
import { useEditorStore } from '@editor/stores/editor';
import { layerBox } from '@editor/document/ops';
import { __ } from '@editor/i18n';
import ErrorState from '@editor/components/ui/ErrorState.vue';
import EditorTopBar from './EditorTopBar.vue';
import StageToolbar from './StageToolbar.vue';
import LayersPanel from './LayersPanel.vue';
import StageCanvas from './StageCanvas.vue';
import PropertiesPanel from './PropertiesPanel.vue';
import EditorNotices from './EditorNotices.vue';

const props = defineProps<{ id: number }>();
const editor = useEditorStore();
const $q = useQuasar();

watch(
  () => props.id,
  (id) => void editor.load(id),
  { immediate: true },
);

/** Shortcuts never fire while the user types in a field (PLAN.md 4.2). */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function onKeydown(event: KeyboardEvent): void {
  if (editor.loadState !== 'ready' || isTyping(event.target) || document.querySelector('.q-dialog'))
    return;
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (mod && key === 'z' && !event.shiftKey) {
    event.preventDefault();
    editor.undo();
  } else if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) {
    event.preventDefault();
    editor.redo();
  } else if (mod && key === 's') {
    event.preventDefault();
    void editor.save();
  } else if (mod && key === 'd' && editor.selectedLayers.length > 0) {
    event.preventDefault();
    editor.duplicateLayers();
  } else if (
    (event.key === 'Delete' || event.key === 'Backspace') &&
    editor.selectedLayers.length > 0
  ) {
    event.preventDefault();
    editor.removeLayers();
  } else if (event.key === 'Escape') {
    editor.clearSelection();
  } else if (event.key.startsWith('Arrow') && editor.selectedLayers.length > 0) {
    event.preventDefault();
    nudge(event.key, event.shiftKey ? 10 : 1);
  }
}

/** Arrow keys move the selection; one key press is one undo step. */
function nudge(key: string, step: number): void {
  const stage = editor.stage;
  if (!stage) return;
  const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
  const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
  editor.beginGesture();
  for (const layer of editor.selectedLayers) {
    const box = layerBox(layer, editor.device, stage.stageWidth, stage.stageHeight);
    editor.moveLayerBox(
      layer.id,
      { ...box, left: box.left + dx, top: box.top + dy },
      { position: true, size: false },
    );
  }
  editor.endGesture();
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (editor.dirty) {
    event.preventDefault();
    event.returnValue = '';
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', onBeforeUnload);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('beforeunload', onBeforeUnload);
  editor.cancelAutosave();
});

onBeforeRouteLeave(async () => {
  if (!editor.dirty || editor.saveState === 'conflict') return true;
  await editor.save();
  if (!editor.dirty) return true;
  return new Promise<boolean>((resolve) => {
    $q.dialog({
      title: __('Leave without saving?'),
      message: __('Your latest changes could not be saved. A local copy is kept in this browser.'),
      cancel: { label: __('Stay'), flat: true, noCaps: true },
      ok: { label: __('Leave'), color: 'negative', unelevated: true, noCaps: true },
      persistent: true,
    })
      .onOk(() => resolve(true))
      .onCancel(() => resolve(false));
  });
});
</script>

<template>
  <div class="sws-editor">
    <div
      v-if="editor.loadState === 'loading' || editor.loadState === 'idle'"
      class="sws-editor__loading"
      aria-busy="true"
    >
      <q-spinner size="40px" color="primary" />
      <span>{{ __('Loading slider …') }}</span>
    </div>
    <ErrorState
      v-else-if="editor.loadState === 'error' && editor.loadError"
      :error="editor.loadError"
      @retry="editor.load(id)"
    />
    <template v-else-if="editor.document">
      <EditorTopBar />
      <EditorNotices />
      <div class="sws-editor__grid">
        <div class="sws-editor__center">
          <StageToolbar />
          <StageCanvas class="sws-editor__canvas" />
          <LayersPanel class="sws-editor__layers" />
        </div>
        <PropertiesPanel class="sws-editor__right" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.sws-editor {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--wp-admin--admin-bar--height, 32px));
  min-height: 0;
  min-width: 0;
}
.sws-editor__loading {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
  color: var(--sws-muted);
}
.sws-editor__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  flex: 1;
  min-height: 0;
}
.sws-editor__center {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.sws-editor__canvas {
  flex: 1;
  min-height: 0;
}
.sws-editor__layers {
  flex: none;
  max-height: 220px;
  overflow: auto;
  border-radius: 0;
  border-width: 1px 0 0;
  box-shadow: none;
}
.sws-editor__layers :deep(.sws-card__header) {
  padding: 4px 12px;
}
.sws-editor__layers :deep(.sws-card__body) {
  padding: 0;
}
@media (max-width: 900px) {
  .sws-editor {
    height: auto;
  }
  .sws-editor__grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .sws-editor__canvas {
    min-height: 340px;
  }
}
</style>
