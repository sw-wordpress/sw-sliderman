<script setup lang="ts">
import { computed } from 'vue';
import type { Layer, LayerType } from '@shared/types';
import { resolveLayerLayout } from '@shared/layout';
import { useEditorStore } from '@editor/stores/editor';
import { __, sprintf } from '@editor/i18n';
import SwsCard from '@editor/components/ui/SwsCard.vue';

const editor = useEditorStore();

/** Top-most layer first (the document stores bottom-to-top render order). */
const layers = computed<Layer[]>(() => [...(editor.slide?.layers ?? [])].reverse());
const icons: Record<LayerType, string> = { text: 'r_title', image: 'r_image', button: 'r_smart_button' };

function visible(layer: Layer): boolean {
  return resolveLayerLayout(layer, editor.device).visible;
}

function toggleVisible(layer: Layer): void {
  editor.setLayout(layer.id, 'visible', !visible(layer));
}

function select(event: MouseEvent, layer: Layer): void {
  editor.selectLayer(layer.id, event.shiftKey || event.metaKey || event.ctrlKey);
}
</script>

<template>
  <SwsCard :title="__('Layers')" :padding="false" class="sws-panel">
    <template #actions>
      <q-btn flat dense round icon="r_add" :aria-label="__('Add layer')">
        <q-tooltip>{{ __('Add layer') }}</q-tooltip>
        <q-menu auto-close>
          <q-list dense style="min-width: 160px">
            <q-item clickable @click="editor.addLayer('text')">
              <q-item-section avatar><q-icon name="r_title" /></q-item-section>
              <q-item-section>{{ __('Text') }}</q-item-section>
            </q-item>
            <q-item clickable @click="editor.addLayer('image')">
              <q-item-section avatar><q-icon name="r_image" /></q-item-section>
              <q-item-section>{{ __('Image') }}</q-item-section>
            </q-item>
            <q-item clickable @click="editor.addLayer('button')">
              <q-item-section avatar><q-icon name="r_smart_button" /></q-item-section>
              <q-item-section>{{ __('Button') }}</q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>
    </template>
    <p v-if="layers.length === 0" class="sws-panel__empty">{{ __('No layers yet. Add text, an image or a button.') }}</p>
    <ol v-else class="sws-items">
      <li v-for="(layer, index) in layers" :key="layer.id">
        <div class="sws-item" :class="{ 'sws-item--active': editor.selectedLayerIds.includes(layer.id), 'sws-item--off': !visible(layer) }">
          <button type="button" class="sws-item__main" :aria-pressed="editor.selectedLayerIds.includes(layer.id)" @click="select($event, layer)">
            <q-icon :name="icons[layer.type]" size="18px" aria-hidden="true" />
            <span class="sws-item__name sws-truncate">{{ layer.name || __('Unnamed layer') }}</span>
          </button>
          <q-btn
            flat
            dense
            round
            size="sm"
            :icon="visible(layer) ? 'r_visibility' : 'r_visibility_off'"
            :aria-label="sprintf(visible(layer) ? __('Hide “%s” on this screen size') : __('Show “%s” on this screen size'), layer.name)"
            :aria-pressed="!visible(layer)"
            @click="toggleVisible(layer)"
          />
          <q-btn
            flat
            dense
            round
            size="sm"
            :icon="layer.locked ? 'r_lock' : 'r_lock_open'"
            :aria-label="sprintf(layer.locked ? __('Unlock “%s”') : __('Lock “%s”'), layer.name)"
            :aria-pressed="layer.locked"
            @click="editor.updateLayer(layer.id, (l) => (l.locked = !l.locked))"
          />
          <q-btn flat dense round size="sm" icon="r_more_vert" :aria-label="sprintf(__('Actions for “%s”'), layer.name)">
            <q-menu auto-close>
              <q-list dense style="min-width: 180px">
                <q-item clickable :disable="index === 0" @click="editor.moveLayer(layer.id, 1)">
                  <q-item-section>{{ __('Bring forward') }}</q-item-section>
                </q-item>
                <q-item clickable :disable="index === layers.length - 1" @click="editor.moveLayer(layer.id, -1)">
                  <q-item-section>{{ __('Send backward') }}</q-item-section>
                </q-item>
                <q-item clickable @click="editor.selectLayer(layer.id); editor.duplicateLayers()">
                  <q-item-section>{{ __('Duplicate') }}</q-item-section>
                </q-item>
                <q-item clickable @click="editor.removeLayers([layer.id])">
                  <q-item-section class="text-negative">{{ __('Delete') }}</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
        </div>
      </li>
    </ol>
  </SwsCard>
</template>

<style scoped src="./panel.css"></style>
