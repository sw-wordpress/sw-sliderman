<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
</script>

<template>
  <DefaultTheme.Layout>
    <template #layout-bottom>
      <footer class="guide-footer">
        Open source by Stefan Warnat – free to use, free to change, better together.
      </footer>
    </template>
  </DefaultTheme.Layout>
</template>

<style>
.guide-footer {
  position: relative;
  z-index: 1;
  border-top: 1px solid var(--vp-c-divider);
  padding: 24px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  text-align: center;
  font-size: 14px;
  line-height: 1.6;
}
@media (min-width: 960px) {
  .VPContent.has-sidebar ~ .guide-footer {
    margin-left: var(--vp-sidebar-width);
  }
}
@media (min-width: 1440px) {
  .VPContent.has-sidebar ~ .guide-footer {
    margin-left: calc((100vw - var(--vp-layout-max-width)) / 2 + var(--vp-sidebar-width));
  }
}
</style>
