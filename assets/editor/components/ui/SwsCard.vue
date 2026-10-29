<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string | undefined;
    subtitle?: string | undefined;
    icon?: string | undefined;
    padding?: boolean;
    interactive?: boolean;
    tag?: string;
    accent?: boolean;
  }>(),
  {
    title: undefined,
    subtitle: undefined,
    icon: undefined,
    padding: true,
    interactive: false,
    tag: 'section',
    accent: false,
  },
);
</script>

<template>
  <component
    :is="tag"
    class="sws-card"
    :class="{ 'sws-card--interactive': interactive, 'sws-card--accent': accent }"
  >
    <header v-if="title || $slots.header || $slots.actions" class="sws-card__header">
      <slot name="header">
        <div class="sws-card__heading">
          <span v-if="icon" class="sws-card__icon" aria-hidden="true"
            ><q-icon :name="icon" size="20px"
          /></span>
          <div class="sws-card__titles">
            <h2 class="sws-card__title">{{ title }}</h2>
            <p v-if="subtitle" class="sws-card__subtitle">{{ subtitle }}</p>
          </div>
        </div>
      </slot>
      <div v-if="$slots.actions" class="sws-card__actions"><slot name="actions" /></div>
    </header>
    <div class="sws-card__body" :class="{ 'sws-card__body--flush': !padding }"><slot /></div>
    <footer v-if="$slots.footer" class="sws-card__footer"><slot name="footer" /></footer>
  </component>
</template>

<style scoped>
.sws-card {
  position: relative;
  background: var(--sws-surface);
  border: 1px solid var(--sws-border);
  border-radius: var(--sws-radius);
  box-shadow: var(--sws-shadow-1);
  min-width: 0;
  transition:
    box-shadow 0.2s ease,
    transform 0.2s ease,
    border-color 0.2s ease;
}
.sws-card--interactive:hover {
  box-shadow: var(--sws-shadow-2);
  transform: translateY(-1px);
}
.sws-card--accent::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  border-radius: var(--sws-radius) var(--sws-radius) 0 0;
  background: var(--sws-gradient);
}
.sws-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 18px 22px 0;
}
.sws-card__heading {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.sws-card__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 10px;
  color: var(--sws-primary);
  background: var(--sws-gradient-soft);
}
.sws-card__title {
  font-size: 16px;
  font-weight: 650;
  line-height: 1.3;
}
.sws-card__subtitle {
  font-size: 13px;
  color: var(--sws-muted);
}
.sws-card__actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.sws-card__body {
  padding: 18px 22px 22px;
}
.sws-card__body--flush {
  padding: 12px 0 0;
}
.sws-card__footer {
  padding: 14px 22px;
  border-top: 1px solid var(--sws-border);
}
@media (max-width: 520px) {
  .sws-card__header {
    padding: 16px 16px 0;
  }
  .sws-card__body {
    padding: 14px 16px 18px;
  }
}
</style>
