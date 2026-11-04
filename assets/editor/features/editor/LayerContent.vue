<script setup lang="ts">
import { computed, h, type FunctionalComponent } from 'vue';
import type { Layer, RichParagraph } from '@shared/types';
import { useEditorStore } from '@editor/stores/editor';
import { richToHtml } from '@shared/richtext';
import { focalPosition } from '@shared/css';
import { __ } from '@editor/i18n';

/**
 * Editor rendering of layer content with the frontend classes. Text is plain text with line
 * breaks (`white-space: pre-line` equals the server's nl2br + whitespace collapsing); nothing is
 * rendered as HTML.
 */
const props = defineProps<{ layer: Layer }>();
const editor = useEditorStore();

/**
 * Rich text is markup built and escaped by shared/richtext.ts, the function the contract tests
 * compare with the PHP renderer; nothing from the document is inserted unescaped.
 */
const RichText: FunctionalComponent<{ tag: string; rich: readonly RichParagraph[] }> = (props) =>
  h(props.tag, { class: 'sws-text sws-text--rich', innerHTML: richToHtml(props.rich) });
RichText.props = ['tag', 'rich'];

const image = computed(() => {
  if (props.layer.type !== 'image' || props.layer.content.attachmentId === null) return null;
  return editor.media[props.layer.content.attachmentId]?.url ?? null;
});
</script>

<template>
  <RichText
    v-if="layer.type === 'text' && layer.content.rich && layer.content.rich.length > 0"
    :tag="layer.content.tag"
    :rich="layer.content.rich"
  />
  <component
    :is="layer.content.tag"
    v-else-if="layer.type === 'text'"
    class="sws-text sws-text--editor"
    >{{ layer.content.text }}</component
  >
  <template v-else-if="layer.type === 'image'">
    <img
      v-if="image"
      class="sws-image"
      :class="`sws-fit-${layer.content.fit}`"
      :style="{
        objectPosition: focalPosition(layer.content.focalX, layer.content.focalY) ?? undefined,
      }"
      :src="image"
      :alt="layer.content.alt"
      draggable="false"
    />
    <span v-else class="sws-image-placeholder">
      <q-icon name="r_add_photo_alternate" size="32px" aria-hidden="true" />
      {{ __('Choose an image') }}
    </span>
  </template>
  <span
    v-else-if="layer.type === 'shape'"
    class="sws-shape"
    :class="`sws-shape--${layer.content.kind}`"
    aria-hidden="true"
  ></span>
  <span v-else class="sws-button">{{ layer.content.label }}</span>
</template>

<style scoped>
.sws-shape {
  display: block;
  width: 100%;
  height: 100%;
}
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
  font:
    600 14px/1.3 system-ui,
    sans-serif;
  text-align: center;
}
</style>
