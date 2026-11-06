<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { EffectLayer } from '@shared/types';
import { useEditorStore } from '@editor/stores/editor';
import { effectInfo } from '@editor/effects/catalog';
import { onEffectEvent } from '@editor/effects/bus';
import { resolvedParams } from '@editor/effects/ops';
import { __ } from '@editor/i18n';
import { effectText } from './labels';
import type * as PreviewModule from '@gpu/preview';
import type { Preview } from '@gpu/preview';

/**
 * Live preview of an effect layer on the editor stage, run by the same stage code as the frontend
 * (loaded lazily as its own chunk). Without WebGL2, with reduced motion, or for an unknown effect
 * type the static image or a placeholder stays.
 */
const props = defineProps<{ layer: EffectLayer }>();
const editor = useEditorStore();
const host = ref<HTMLElement | null>(null);
const state = ref('idle');
let preview: Preview | null = null;
let disposed = false;
let moduleLoaded: typeof PreviewModule | null = null;

const info = computed(() => effectInfo(props.layer.content.effect));
const fallback = computed(() => {
  const id = props.layer.content.fallbackImageId;
  return id ? (editor.media[id]?.url ?? null) : null;
});
const assets = computed(() => {
  const out: Record<string, { url: string; width: number; height: number }> = {};
  for (const [key, id] of Object.entries(props.layer.content.assets ?? {})) {
    const media = editor.media[id];
    if (media) out[key] = media;
  }
  return out;
});
// A different picture or effect type needs a new instance; parameters and the seed are applied live.
const identity = computed(() =>
  JSON.stringify([
    props.layer.content.effect,
    props.layer.content.schemaVersion,
    props.layer.content.assets,
    Object.keys(assets.value).length,
  ]),
);

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

async function start(): Promise<void> {
  const element = host.value;
  const effect = info.value;
  if (!element || !effect) return;
  moduleLoaded ??= await import('@gpu/preview');
  if (disposed || !host.value) return;
  const content = props.layer.content;
  preview = moduleLoaded.createPreview(
    element,
    {
      type: content.effect,
      schemaVersion: content.schemaVersion,
      seed: content.seed,
      quality: content.quality,
      module: effect.module,
      params: resolvedParams(effect, content.params),
      assets: assets.value,
    },
    reducedMotion,
    (next) => (state.value = next),
  );
}

function stop(): void {
  preview?.dispose();
  preview = null;
  state.value = 'idle';
}

watch(identity, () => {
  stop();
  void start();
});
watch(
  () =>
    [props.layer.content.params, props.layer.content.seed, props.layer.content.quality] as const,
  ([params, seed, quality]) => {
    const effect = info.value;
    if (!preview || !effect) return;
    void preview.reconfigure({ params: resolvedParams(effect, params), seed, quality });
  },
);

const offEvent = onEffectEvent((layerId, event) => {
  if (layerId === props.layer.id) preview?.event(event);
});
const onPointer = (event: PointerEvent): void =>
  preview?.setPointer({ x: event.clientX, y: event.clientY, down: event.buttons > 0 });
const onLeave = (): void => preview?.setPointer(null);

onMounted(() => {
  void start();
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('pointerleave', onLeave);
});
onBeforeUnmount(() => {
  disposed = true;
  offEvent();
  window.removeEventListener('pointermove', onPointer);
  document.removeEventListener('pointerleave', onLeave);
  stop();
});
</script>

<template>
  <div ref="host" class="sws-fx" :data-sws-fx="layer.content.effect">
    <img
      v-if="fallback"
      class="sws-fx__fallback"
      :src="fallback"
      :alt="layer.content.alt ?? ''"
      draggable="false"
    />
    <span v-else class="sws-effect-placeholder" aria-hidden="true">
      <q-icon name="r_auto_awesome" size="32px" />
      {{ info ? effectText(info.label) : layer.content.effect }}
      <small v-if="!info">{{ __('not available') }}</small>
    </span>
  </div>
</template>

<style scoped>
/* The live canvas replaces the placeholder. */
.sws-fx--live .sws-effect-placeholder {
  visibility: hidden;
}
.sws-effect-placeholder {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: repeating-linear-gradient(
    45deg,
    rgba(120, 185, 255, 0.18),
    rgba(120, 185, 255, 0.18) 10px,
    rgba(120, 185, 255, 0.08) 10px,
    rgba(120, 185, 255, 0.08) 20px
  );
  color: #fff;
  font:
    14px/1.2 system-ui,
    sans-serif;
}
</style>
