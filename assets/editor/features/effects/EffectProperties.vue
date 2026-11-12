<script setup lang="ts">
import { computed, provide } from 'vue';
import { LIMITS } from '@shared/limits';
import { EFFECT_QUALITIES, type EffectContent, type EffectLayer } from '@shared/types';
import type { DeepMutable } from '@editor/document/ops';
import { __, sprintf } from '@editor/i18n';
import { useEditorStore } from '@editor/stores/editor';
import { pickImage, previewOf } from '@editor/composables/useMediaPicker';
import { effectInfo, effectInfos } from '@editor/effects/catalog';
import { emitEffectEvent } from '@editor/effects/bus';
import {
  clearAt,
  newEffectContent,
  presetChanges,
  randomSeed,
  materializeList,
  resolvedParams,
  setAt,
} from '@editor/effects/ops';
import {
  propertyEntries,
  fieldKind,
  isJson,
  type Json,
  type Path,
} from '@editor/effects/schemaTools';
import AccordionSection from '@editor/components/AccordionSection.vue';
import SchemaField from './SchemaField.vue';
import { effectText } from './labels';
import { EFFECT_FORM } from './formKey';

/**
 * Bedienfeld einer Effekt-Ebene: Effekt und Preset, Medien, Zufallswert, Qualität und die aus dem
 * Schema erzeugten Parameter. Alle Änderungen laufen über den normalen Dokumentpfad (Undo/Redo).
 */
const props = defineProps<{ layer: EffectLayer }>();
const editor = useEditorStore();

const info = computed(() => effectInfo(props.layer.content.effect));
const infos = computed(() => effectInfos());
const content = computed(() => props.layer.content);
const outdated = computed(
  () => info.value !== null && content.value.schemaVersion !== info.value.schemaVersion,
);
const schema = computed<Json>(() =>
  info.value && isJson(info.value.schema) ? info.value.schema : {},
);
const values = computed(() => (info.value ? resolvedParams(info.value, content.value.params) : {}));
const issues = computed(() =>
  editor.issues.filter(
    (issue) =>
      issue.path.startsWith(`/slides/`) &&
      issue.path.includes(`/layers/`) &&
      issue.path.includes('/content/params'),
  ),
);

function update(change: (c: DeepMutable<EffectContent>) => void): void {
  editor.updateLayer(props.layer.id, (layer) => {
    if (layer.type === 'effect') change(layer.content);
  });
}

// ---- parameters (schema form) ----
function setParam(path: Path, value: unknown): void {
  update((c) => {
    const base = materializeList(c.params, values.value, path);
    c.params = setAt(base, path, value) as Record<string, unknown>;
    delete c.preset;
  });
}
function resetParam(path: Path): void {
  update((c) => {
    c.params = (clearAt(c.params, path) ?? {}) as Record<string, unknown>;
    delete c.preset;
  });
}
provide(EFFECT_FORM, {
  values,
  set: setParam,
  reset: resetParam,
  begin: () => editor.beginGesture(),
  end: () => editor.endGesture(),
});

// Root scalars are shown together as "General"; every object becomes its own section.
const groups = computed(() => {
  const entries = propertyEntries(schema.value);
  const scalars = entries.filter(([, s]) => fieldKind(s) !== 'object' && fieldKind(s) !== 'list');
  const sections = entries.filter(([, s]) => fieldKind(s) === 'object' || fieldKind(s) === 'list');
  return { scalars, sections };
});
function resetGroup(keys: string[]): void {
  update((c) => {
    let params: unknown = c.params;
    for (const key of keys) params = clearAt(params, [key]);
    c.params = (params ?? {}) as Record<string, unknown>;
    delete c.preset;
  });
}

// ---- effect, preset, seed, quality ----
function changeType(type: string): void {
  const next = effectInfo(type);
  if (!next || next.type === content.value.effect) return;
  const fresh = newEffectContent(next);
  update((c) => {
    Object.assign(c, {
      effect: fresh.effect,
      schemaVersion: fresh.schemaVersion,
      seed: fresh.seed,
      params: fresh.params,
      assets: {},
    });
    if (fresh.preset) c.preset = fresh.preset;
    else delete c.preset;
  });
}
function applyPreset(id: string): void {
  const next = info.value ? presetChanges(info.value, id) : null;
  if (!next) return;
  update((c) => Object.assign(c, next));
}
function setSeed(raw: string | number | null): void {
  if (String(raw ?? '').trim() === '') return; // a cleared field is not a seed
  const n = Math.round(Number(String(raw ?? '').replace(',', '.')));
  if (Number.isFinite(n) && n >= 0 && n <= 2147483647) update((c) => (c.seed = n));
}
function randomise(): void {
  update((c) => (c.seed = randomSeed()));
}
const qualityLabels: Record<string, string> = {
  auto: __('Automatic'),
  low: __('Low'),
  medium: __('Medium'),
  high: __('High'),
  ultra: __('Ultra'),
};
const qualityOptions = EFFECT_QUALITIES.map((value) => ({
  value,
  label: qualityLabels[value] ?? value,
}));
function useCurrentVersion(): void {
  if (info.value) update((c) => (c.schemaVersion = info.value?.schemaVersion ?? c.schemaVersion));
}

// ---- media ----
const thumb = (id: number | null | undefined): string | null =>
  id ? (editor.media[id]?.url ?? null) : null;
async function chooseAsset(key: string): Promise<void> {
  const attachment = await pickImage();
  if (!attachment) return;
  editor.rememberMedia(attachment.id, previewOf(attachment));
  update((c) => {
    c.assets = { ...(c.assets ?? {}), [key]: attachment.id };
    // The same picture is the natural static fallback; keep an existing choice.
    if (!c.fallbackImageId) c.fallbackImageId = attachment.id;
    if (!c.alt && attachment.alt) c.alt = attachment.alt.slice(0, LIMITS.altLength);
  });
}
function removeAsset(key: string): void {
  update((c) => {
    const rest = { ...(c.assets ?? {}) };
    delete rest[key];
    c.assets = rest;
  });
}
async function chooseFallback(): Promise<void> {
  const attachment = await pickImage();
  if (!attachment) return;
  editor.rememberMedia(attachment.id, previewOf(attachment));
  update((c) => {
    c.fallbackImageId = attachment.id;
    if (!c.alt && attachment.alt) c.alt = attachment.alt.slice(0, LIMITS.altLength);
  });
}
const effectCount = computed(
  () => editor.slide?.layers.filter((l) => l.type === 'effect').length ?? 0,
);
const atLimit = computed(() => effectCount.value > LIMITS.effectLayersPerSlide);
const summary = computed(() => (info.value ? effectText(info.value.label) : content.value.effect));
</script>

<template>
  <AccordionSection id="effect.main" :title="__('Effect')" default-open>
    <template #summary>{{ summary }}</template>

    <p v-if="!info" class="sws-props__warn" role="status">
      <q-icon name="r_warning" aria-hidden="true" />
      {{
        sprintf(
          __(
            'The effect "%s" is not available. Its plugin may be inactive; visitors see the static image.',
          ),
          content.effect,
        )
      }}
    </p>
    <template v-else>
      <q-select
        v-if="infos.length > 1"
        :model-value="content.effect"
        :options="infos.map((i) => ({ value: i.type, label: effectText(i.label) }))"
        emit-value
        map-options
        dense
        outlined
        :label="__('Effect type')"
        @update:model-value="changeType"
      />
      <p v-if="info.description" class="sws-fxp__hint">{{ effectText(info.description) }}</p>

      <div
        v-if="info.presets.length > 0"
        class="sws-fxp__presets"
        role="group"
        :aria-label="__('Presets')"
      >
        <q-btn
          v-for="preset in info.presets"
          :key="preset.id"
          no-caps
          dense
          :outline="content.preset !== preset.id"
          :unelevated="content.preset === preset.id"
          :color="content.preset === preset.id ? 'primary' : undefined"
          :label="effectText(preset.name)"
          :aria-pressed="content.preset === preset.id"
          :title="effectText(preset.description)"
          @click="applyPreset(preset.id)"
        />
      </div>

      <div class="sws-props__grid">
        <div class="sws-props__field">
          <q-input
            :model-value="String(content.seed)"
            dense
            outlined
            inputmode="numeric"
            :label="__('Seed')"
            @update:model-value="setSeed"
          >
            <template #append>
              <q-btn
                flat
                dense
                round
                icon="r_casino"
                :aria-label="__('New random seed')"
                @click="randomise"
              />
            </template>
          </q-input>
        </div>
        <div class="sws-props__field">
          <q-select
            :model-value="content.quality"
            :options="qualityOptions"
            emit-value
            map-options
            dense
            outlined
            :label="__('Quality')"
            @update:model-value="(v: string) => update((c) => (c.quality = v as never))"
          />
        </div>
      </div>
      <q-btn
        v-if="info.continuous"
        outline
        no-caps
        icon="r_bolt"
        :label="__('Trigger impulse')"
        @click="emitEffectEvent(layer.id, { type: 'burst', intensity: 1 })"
      />
      <p v-if="atLimit" class="sws-props__warn" role="status">
        <q-icon name="r_warning" aria-hidden="true" />
        {{ sprintf(__('A slide can hold at most %d effect layers.'), LIMITS.effectLayersPerSlide) }}
      </p>
      <p v-if="outdated" class="sws-props__warn" role="status">
        <q-icon name="r_warning" aria-hidden="true" />
        {{ __('The parameters were saved for another version of this effect.') }}
        <q-btn flat dense no-caps :label="__('Use current version')" @click="useCurrentVersion" />
      </p>
      <p v-if="issues.length > 0" class="sws-props__warn" role="alert">
        <q-icon name="r_error" aria-hidden="true" />
        {{
          __(
            'Some parameters are invalid. The preview keeps the last valid look; saving is paused until they are fixed.',
          )
        }}
      </p>
    </template>
  </AccordionSection>

  <AccordionSection id="effect.media" :title="__('Media')" default-open>
    <template #summary>{{
      content.fallbackImageId ? __('Static image set') : __('No static image')
    }}</template>
    <div v-for="slot in info?.assets ?? []" :key="slot.key" class="sws-image-pick">
      <img
        v-if="thumb(content.assets?.[slot.key])"
        class="sws-image-pick__thumb"
        :src="thumb(content.assets?.[slot.key]) ?? ''"
        alt=""
        width="64"
        height="64"
      />
      <div class="sws-fxp__pick">
        <span class="sws-fxp__label">{{ effectText(slot.label) }}</span>
        <span>
          <q-btn
            outline
            dense
            no-caps
            icon="r_photo_library"
            :label="content.assets?.[slot.key] ? __('Replace image') : __('Choose image')"
            @click="chooseAsset(slot.key)"
          />
          <q-btn
            v-if="content.assets?.[slot.key]"
            flat
            dense
            no-caps
            :label="__('Remove image')"
            @click="removeAsset(slot.key)"
          />
        </span>
      </div>
    </div>
    <div class="sws-image-pick">
      <img
        v-if="thumb(content.fallbackImageId)"
        class="sws-image-pick__thumb"
        :src="thumb(content.fallbackImageId) ?? ''"
        alt=""
        width="64"
        height="64"
      />
      <div class="sws-fxp__pick">
        <span class="sws-fxp__label">{{ __('Static image') }}</span>
        <q-btn
          outline
          dense
          no-caps
          icon="r_image"
          :label="content.fallbackImageId ? __('Replace image') : __('Choose image')"
          @click="chooseFallback"
        />
      </div>
    </div>
    <p class="sws-fxp__hint">
      {{
        __(
          'The static image is shown without JavaScript, with reduced motion and when the GPU is unavailable.',
        )
      }}
    </p>
    <q-input
      :model-value="content.alt ?? ''"
      dense
      outlined
      :label="__('Alternative text of the static image')"
      :maxlength="LIMITS.altLength"
      @update:model-value="(v: string | number | null) => update((c) => (c.alt = String(v ?? '')))"
    />
  </AccordionSection>

  <template v-if="info && !outdated">
    <AccordionSection
      v-if="groups.scalars.length > 0"
      id="effect.general"
      :title="__('General')"
      default-open
    >
      <SchemaField
        v-for="[key, child] in groups.scalars"
        :key="key"
        :schema="child"
        :path="[key]"
        :name="key"
      />
    </AccordionSection>
    <AccordionSection
      v-for="[key, child] in groups.sections"
      :id="`effect.group.${key}`"
      :key="key"
      :title="effectText(typeof child.title === 'string' ? child.title : key)"
    >
      <SchemaField :schema="child" :path="[key]" :name="key" />
      <q-btn
        flat
        dense
        no-caps
        icon="r_restart_alt"
        :label="__('Reset to defaults')"
        @click="resetGroup([key])"
      />
    </AccordionSection>
  </template>
</template>

<style scoped>
.sws-fxp__hint {
  margin: 0;
  font-size: 12px;
  color: var(--sws-muted);
}
.sws-fxp__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sws-fxp__pick {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.sws-fxp__label {
  font-size: 12px;
  color: var(--sws-muted);
}
</style>
