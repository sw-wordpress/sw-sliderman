<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useEditorStore } from '@editor/stores/editor';
import { __, sprintf } from '@editor/i18n';
import LayerProperties from './LayerProperties.vue';
import SlideProperties from './SlideProperties.vue';
import { setAllSections, isSectionOpen } from '@editor/composables/useAccordion';
import AlignTools from './AlignTools.vue';

const editor = useEditorStore();
const tab = ref('slide');
/** Sections per tab with their default open state (mirrors the `default-open` props). */
const sectionDefaults: Record<string, Record<string, boolean>> = {
  layer: {
    'layer.content': true,
    'layer.layout': true,
    'layer.typography': false,
    'layer.box': false,
    'layer.border': false,
    'layer.animation': false,
  },
  slide: { 'slide.general': true, 'slide.background': false },
  slider: { 'slider.settings': true, 'slider.breakpoints': false },
};
const sectionIds = computed(() => Object.keys(sectionDefaults[tab.value] ?? {}));
const allClosed = computed(() =>
  Object.entries(sectionDefaults[tab.value] ?? {}).every(([id, open]) => !isSectionOpen(id, open)),
);
function toggleAll(): void {
  setAllSections(allClosed.value, sectionIds.value);
}
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
    <div class="sws-properties__foot">
      <span></span>
      <q-btn flat dense no-caps size="sm" color="primary" @click="toggleAll">
        {{ allClosed ? __('Expand all') : __('Collapse all') }}
      </q-btn>
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
  overflow-y: auto;
  min-height: 0;
  flex: 1;
}
.sws-properties__foot {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 16px;
  border-top: 1px solid var(--sws-border);
  color: var(--sws-muted);
  font-size: 12px;
}
.sws-properties__multi {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
}
.sws-properties__align {
  margin: 12px 16px;
}
.sws-properties__empty {
  padding: 12px 16px;
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
