<script setup lang="ts">
import { computed } from 'vue';
import type { Layer } from '@shared/types';
import { useEditorStore } from '@editor/stores/editor';
import { __ } from '@editor/i18n';

/**
 * Editor rendering of layer content with the frontend classes. Text is plain text with line
 * breaks (`white-space: pre-line` equals the server's nl2br + whitespace collapsing); nothing is
 * rendered as HTML.
 */
const props = defineProps<{ layer: Layer }>();
const editor = useEditorStore();

const image = computed(() => {
  if (props.layer.type !== 'image' || props.layer.content.attachmentId === null) return null;
  return editor.media[props.layer.content.attachmentId]?.url ?? null;
});
</script>

<template>
  <component :is="layer.content.tag" v-if="layer.type === 'text'" class="sws-text sws-text--editor">{{ layer.content.text }}</component>
  <template v-else-if="layer.type === 'image'">
    <img v-if="image" class="sws-image" :class="`sws-fit-${layer.content.fit}`" :src="image" :alt="layer.content.alt" draggable="false" />
    <span v-else class="sws-image-placeholder">
      <q-icon name="r_add_photo_alternate" size="32px" aria-hidden="true" />
      {{ __('Choose an image') }}
    </span>
  </template>
  <span v-else class="sws-button">{{ layer.content.label }}</span>
</template>

<style scoped>
.sws-text--editor {
  white-space: pre-line;
}
.sws-image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  border: 2px dashed rgba(148, 163, 184, 0.9);
  background: rgba(148, 163, 184, 0.25);
  color: #e2e8f0;
  font: 600 14px/1.3 system-ui, sans-serif;
  text-align: center;
}
</style>
