<script setup lang="ts">
import { ref, watch } from 'vue';
import { useEditorStore } from '@editor/stores/editor';
import { __, sprintf } from '@editor/i18n';
import LayerProperties from './LayerProperties.vue';
import SlideProperties from './SlideProperties.vue';
import AlignTools from './AlignTools.vue';

const editor = useEditorStore();
const tab = ref('slide');
watch(
  () => editor.selectedLayerIds.join(','),
  () => {
    tab.value = editor.selectedLayerIds.length ? 'layer' : 'slide';
  },
);
</script>

<template>
  <aside class="sws-properties" :aria-label="__('Properties')">
    <q-tabs
      v-model="tab"
      dense
      no-caps
      align="justify"
      active-color="primary"
      indicator-color="primary"
      class="sws-properties__tabs"
    >
      <q-tab name="layer" :label="__('Layer')" />
      <q-tab name="slide" :label="__('Slide')" />
      <q-tab name="slider" :label="__('Slider')" />
    </q-tabs>
    <div class="sws-properties__body">
      <template v-if="tab === 'layer'">
        <AlignTools v-if="editor.selectedLayers.length > 0" class="sws-properties__align" />
        <LayerProperties
          v-if="editor.selectedLayer"
          :key="editor.selectedLayer.id"
          :layer="editor.selectedLayer"
        />
        <div v-else-if="editor.selectedLayers.length > 1" class="sws-properties__multi">
          <p>
            {{
              sprintf(
                __('%d layers selected. Drag them together on the canvas or use the arrow keys.'),
                editor.selectedLayers.length,
              )
            }}
          </p>
          <q-btn
            outline
            no-caps
            icon="r_content_copy"
            :label="__('Duplicate')"
            @click="editor.duplicateLayers()"
          />
          <q-btn
            outline
            no-caps
            color="negative"
            icon="r_delete"
            :label="__('Delete')"
            @click="editor.removeLayers()"
          />
        </div>
        <p v-else class="sws-properties__empty">
          {{ __('Select a layer to edit its properties.') }}
        </p>
      </template>
      <SlideProperties
        v-else-if="editor.slide"
        :key="`${editor.slide.id}-${tab}`"
        :slide="editor.slide"
        :scope="tab === 'slider' ? 'slider' : 'slide'"
      />
    </div>
  </aside>
</template>
<style scoped>
.sws-properties {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--sws-surface);
  border-left: 1px solid var(--sws-border);
}
.sws-properties__tabs {
  flex: none;
  min-height: 40px;
  border-bottom: 1px solid var(--sws-border);
}
.sws-properties__body {
  padding: 12px;
  overflow-y: auto;
  min-height: 0;
}
.sws-properties__multi {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
}
.sws-properties__align {
  margin-bottom: 10px;
}
.sws-properties__empty {
  color: var(--sws-muted);
  font-size: 13px;
}
@media (max-width: 900px) {
  .sws-properties {
    border-left: 0;
    border-top: 1px solid var(--sws-border);
  }
}
</style>
