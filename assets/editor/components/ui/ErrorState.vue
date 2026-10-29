<script setup lang="ts">
import { __ } from '@editor/i18n';
import type { ApiError } from '@editor/api/client';
import EmptyState from './EmptyState.vue';

defineProps<{ error: ApiError; compact?: boolean }>();
const emit = defineEmits<{ (e: 'retry'): void }>();
</script>

<template>
  <div role="alert">
    <EmptyState
      illustration="error"
      :title="__('Loading failed')"
      :text="error.message"
      :compact="compact"
    >
      <q-btn
        color="primary"
        unelevated
        no-caps
        icon="r_refresh"
        :label="__('Try again')"
        @click="emit('retry')"
      />
      <span class="sws-muted sws-mono"
        >{{ error.code }}<template v-if="error.status"> · {{ error.status }}</template></span
      >
    </EmptyState>
  </div>
</template>
