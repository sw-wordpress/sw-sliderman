<script setup lang="ts">
import { useThemeSync } from '@editor/composables/useTheme';
import ShellLayout from '@editor/layouts/ShellLayout.vue';

useThemeSync(() => document.getElementById('sw-sliderman-app'));
</script>

<template>
  <ShellLayout />
</template>
