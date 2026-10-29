<script setup lang="ts">
import { ref } from 'vue';
import { __ } from '@editor/i18n';

const props = defineProps<{ value: string; label: string }>();
const copied = ref(false);

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.value);
    copied.value = true;
    window.setTimeout(() => (copied.value = false), 1600);
  } catch {
    // Clipboard blocked (insecure context): the code stays visible for manual copying.
    copied.value = false;
  }
}
</script>

<template>
  <q-btn flat dense round size="sm" :icon="copied ? 'r_check' : 'r_content_copy'" :aria-label="label" @click="copy">
    <q-tooltip>{{ copied ? __('Copied') : label }}</q-tooltip>
  </q-btn>
</template>
