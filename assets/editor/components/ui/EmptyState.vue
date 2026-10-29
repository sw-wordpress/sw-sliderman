<script setup lang="ts">
export type Illustration = 'sliders' | 'fonts' | 'search' | 'error';
withDefaults(
  defineProps<{ title: string; text?: string | undefined; illustration?: Illustration; compact?: boolean }>(),
  { text: undefined, illustration: 'sliders', compact: false },
);
</script>

<template>
  <div class="sws-empty" :class="{ 'sws-empty--compact': compact }">
    <svg class="sws-empty__art" viewBox="0 0 160 120" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sws-eg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#4f46e5" />
          <stop offset="1" stop-color="#14b8a6" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="106" rx="52" ry="7" fill="currentColor" opacity="0.08" />
      <rect x="28" y="22" width="104" height="76" rx="14" fill="currentColor" opacity="0.06" />
      <rect
        x="36"
        y="14"
        width="88"
        height="76"
        rx="14"
        fill="var(--sws-surface)"
        stroke="currentColor"
        stroke-opacity="0.18"
        stroke-width="2"
      />
      <rect x="36" y="14" width="88" height="20" rx="14" fill="url(#sws-eg)" opacity="0.9" />
      <rect x="36" y="26" width="88" height="8" fill="url(#sws-eg)" opacity="0.9" />
      <circle cx="48" cy="24" r="2.5" fill="#fff" opacity="0.9" />
      <circle cx="57" cy="24" r="2.5" fill="#fff" opacity="0.6" />
      <circle cx="66" cy="24" r="2.5" fill="#fff" opacity="0.4" />
      <g
        v-if="illustration === 'sliders' || illustration === 'fonts'"
        fill="none"
        stroke="url(#sws-eg)"
        stroke-width="5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <ellipse cx="80" cy="52" rx="20" ry="7" />
        <path d="M60 52v16c0 4 9 7 20 7s20-3 20-7V52" />
        <path d="M60 60c0 4 9 7 20 7s20-3 20-7" opacity="0.6" />
      </g>
      <g
        v-else-if="illustration === 'search'"
        fill="none"
        stroke="url(#sws-eg)"
        stroke-width="5"
        stroke-linecap="round"
      >
        <circle cx="77" cy="58" r="14" />
        <path d="M88 69l11 11" />
      </g>
      <g
        v-else
        fill="none"
        stroke="#dc2626"
        stroke-width="5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M80 44l20 34H60z" />
        <path d="M80 56v10M80 72v.5" />
      </g>
    </svg>
    <h3 class="sws-empty__title">{{ title }}</h3>
    <p v-if="text" class="sws-empty__text">{{ text }}</p>
    <div v-if="$slots.default" class="sws-empty__actions"><slot /></div>
  </div>
</template>

<style scoped>
.sws-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--sws-muted);
}
.sws-empty--compact {
  padding: 20px 12px;
}
.sws-empty__art {
  width: 150px;
  height: auto;
  color: var(--sws-primary);
}
.sws-empty--compact .sws-empty__art {
  width: 100px;
}
.sws-empty__title {
  font-size: 17px;
  font-weight: 650;
  color: var(--sws-text);
}
.sws-empty__text {
  max-width: 46ch;
}
.sws-empty__actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
</style>
