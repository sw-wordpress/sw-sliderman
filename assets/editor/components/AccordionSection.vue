<script setup lang="ts">
import { computed, useId } from 'vue';
import { isSectionOpen, setSectionOpen } from '@editor/composables/useAccordion';

const props = withDefaults(defineProps<{ id: string; title: string; defaultOpen?: boolean }>(), {
  defaultOpen: false,
});
const uid = useId();
const expanded = computed(() => isSectionOpen(props.id, props.defaultOpen));
</script>

<template>
  <section class="sws-acc" :class="{ 'sws-acc--open': expanded }">
    <h3 class="sws-acc__heading">
      <button
        type="button"
        class="sws-acc__toggle"
        :aria-expanded="expanded"
        :aria-controls="`${uid}-body`"
        @click="setSectionOpen(id, !expanded)"
      >
        <q-icon
          :name="expanded ? 'r_expand_more' : 'r_chevron_right'"
          size="18px"
          aria-hidden="true"
        />
        <span class="sws-acc__title">{{ title }}</span>
        <span v-if="!expanded && $slots.summary" class="sws-acc__summary">
          <slot name="summary" />
        </span>
      </button>
    </h3>
    <div v-show="expanded" :id="`${uid}-body`" class="sws-acc__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.sws-acc {
  border-top: 1px solid var(--sws-border);
}
.sws-acc__heading {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}
.sws-acc__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 8px 16px;
  border: 0;
  background: transparent;
  color: var(--sws-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.sws-acc__toggle:hover {
  background: var(--sws-surface-2);
}
.sws-acc__toggle:focus-visible {
  outline: 2px solid var(--sws-focus);
  outline-offset: -2px;
}
.sws-acc__title {
  flex: 1;
  min-width: 0;
}
.sws-acc__summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 60%;
  overflow: hidden;
  color: var(--sws-muted);
  font-size: 12px;
  font-weight: 400;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.sws-acc__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px 18px;
}
</style>
