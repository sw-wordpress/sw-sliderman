<script setup lang="ts">
import { useEditorStore } from '@editor/stores/editor';
import { __, sprintf } from '@editor/i18n';
import SwsCard from '@editor/components/ui/SwsCard.vue';

const editor = useEditorStore();
</script>

<template>
  <SwsCard :title="__('Slides')" :padding="false" class="sws-panel">
    <template #actions>
      <q-btn flat dense no-caps icon="r_add" :label="__('Add slide')" @click="editor.addSlide()">
        <q-tooltip>{{ __('Add slide') }}</q-tooltip>
      </q-btn>
    </template>
    <ol class="sws-items">
      <li v-for="(slide, index) in editor.document?.slides ?? []" :key="slide.id">
        <div
          class="sws-item"
          :class="{
            'sws-item--active': editor.slide?.id === slide.id,
            'sws-item--off': !slide.enabled,
          }"
        >
          <button
            type="button"
            class="sws-item__main"
            :aria-current="editor.slide?.id === slide.id ? 'true' : undefined"
            @click="editor.selectSlide(slide.id)"
          >
            <span
              class="sws-item__swatch"
              :style="{ background: slide.background.color ?? 'transparent' }"
              aria-hidden="true"
            />
            <span class="sws-item__name sws-truncate">{{ index + 1 }}. {{ slide.name }}</span>
          </button>
          <q-btn
            flat
            dense
            round
            size="sm"
            icon="r_more_vert"
            :aria-label="sprintf(__('Actions for “%s”'), slide.name)"
          >
            <q-menu auto-close>
              <q-list dense style="min-width: 190px">
                <q-item clickable :disable="index === 0" @click="editor.moveSlide(slide.id, -1)">
                  <q-item-section>{{ __('Move up') }}</q-item-section>
                </q-item>
                <q-item
                  clickable
                  :disable="index === (editor.document?.slides.length ?? 1) - 1"
                  @click="editor.moveSlide(slide.id, 1)"
                >
                  <q-item-section>{{ __('Move down') }}</q-item-section>
                </q-item>
                <q-item clickable @click="editor.duplicateSlide(slide.id)">
                  <q-item-section>{{ __('Duplicate') }}</q-item-section>
                </q-item>
                <q-item
                  clickable
                  @click="editor.updateSlide(slide.id, (s) => (s.enabled = !s.enabled))"
                >
                  <q-item-section>{{
                    slide.enabled ? __('Disable') : __('Enable')
                  }}</q-item-section>
                </q-item>
                <q-item
                  clickable
                  :disable="(editor.document?.slides.length ?? 0) <= 1"
                  @click="editor.removeSlide(slide.id)"
                >
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
