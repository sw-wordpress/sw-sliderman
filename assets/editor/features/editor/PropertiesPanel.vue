<script setup lang="ts">
import { useEditorStore } from '@editor/stores/editor';
import { __, sprintf } from '@editor/i18n';
import SwsCard from '@editor/components/ui/SwsCard.vue';
import LayerProperties from './LayerProperties.vue';
import SlideProperties from './SlideProperties.vue';

const editor = useEditorStore();
</script>

<template>
  <SwsCard
    :title="editor.selectedLayer ? __('Layer') : editor.selectedLayers.length > 1 ? __('Selection') : __('Slide and slider')"
    class="sws-properties"
  >
    <LayerProperties v-if="editor.selectedLayer" :key="editor.selectedLayer.id" :layer="editor.selectedLayer" />
    <div v-else-if="editor.selectedLayers.length > 1" class="sws-properties__multi">
      <p>{{ sprintf(__('%d layers selected. Drag them together on the canvas or use the arrow keys.'), editor.selectedLayers.length) }}</p>
      <q-btn outline no-caps icon="r_content_copy" :label="__('Duplicate')" @click="editor.duplicateLayers()" />
      <q-btn outline no-caps color="negative" icon="r_delete" :label="__('Delete')" @click="editor.removeLayers()" />
    </div>
    <SlideProperties v-else-if="editor.slide" :key="editor.slide.id" :slide="editor.slide" />
  </SwsCard>
</template>

<style scoped>
.sws-properties {
  position: sticky;
  top: calc(var(--wp-admin--admin-bar--height, 32px) + 12px);
  max-height: calc(100vh - var(--wp-admin--admin-bar--height, 32px) - 24px);
  overflow-y: auto;
}
.sws-properties__multi {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 14px;
}
@media (max-width: 1000px) {
  .sws-properties {
    position: static;
    max-height: none;
  }
}
</style>
