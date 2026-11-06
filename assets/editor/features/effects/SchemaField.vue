<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { __ } from '@editor/i18n';
import {
  branches,
  fieldKind,
  getAt,
  humanize,
  isJson,
  newItem,
  plainNumber,
  propertyEntries,
  stepFor,
  type Json,
  type Path,
} from '@editor/effects/schemaTools';
import { effectText, enumLabel } from './labels';
import { EFFECT_FORM, type EffectForm } from './formKey';

/**
 * One control generated from a parameter schema (docs/GPU_EFFECTS.md): numbers become sliders with
 * a number input, enums selects, colours colour inputs, vectors three inputs, arrays editable lists
 * (also lists of discriminated variants such as the forces). Texts come from the schema (`title`,
 * `description`) and are translated for built-in effects.
 */
const props = defineProps<{ schema: Json; path: Path; name: string }>();
const injected = inject(EFFECT_FORM);
if (!injected) throw new Error('SchemaField needs the effect form');
const form: EffectForm = injected;

const kind = computed(() => fieldKind(props.schema));
const value = computed(() => getAt(form.values.value, props.path));
const title = computed(() =>
  effectText(typeof props.schema.title === 'string' ? props.schema.title : humanize(props.name)),
);
const hint = computed(() =>
  typeof props.schema.description === 'string' ? effectText(props.schema.description) : undefined,
);

// ---- numbers ----
const min = computed(() => Number(props.schema.minimum ?? 0));
const max = computed(() => Number(props.schema.maximum ?? 1));
const step = computed(() => stepFor(min.value, max.value, kind.value === 'integer'));
const live = ref(Number(value.value ?? min.value));
watch(
  () => value.value,
  (v) => {
    if (typeof v === 'number') live.value = v;
  },
);
function commitNumber(raw: number | string | null): void {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) {
    live.value = Number(value.value ?? min.value);
    return;
  }
  const clamped = Math.min(
    max.value,
    Math.max(min.value, kind.value === 'integer' ? Math.round(n) : n),
  );
  live.value = clamped;
  if (clamped !== value.value) form.set(props.path, clamped);
}

// ---- enums / colours / vectors ----
const options = computed(() =>
  (Array.isArray(props.schema.enum) ? props.schema.enum : []).map((v) => ({
    value: String(v),
    label: enumLabel(String(v)),
  })),
);
const vector = computed(() => (Array.isArray(value.value) ? (value.value as number[]) : [0, 0, 0]));
const vectorMin = computed(() =>
  Number((isJson(props.schema.items) ? props.schema.items.minimum : -1) ?? -1),
);
const vectorMax = computed(() =>
  Number((isJson(props.schema.items) ? props.schema.items.maximum : 1) ?? 1),
);
function setVector(index: number, raw: string): void {
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n)) return;
  // Always write the whole vector: the stored parameters may not contain it yet (defaults only).
  const next = [0, 1, 2].map((i) => vector.value[i] ?? 0);
  next[index] = Math.min(vectorMax.value, Math.max(vectorMin.value, n));
  form.set(props.path, next);
}

function setColor(index: number, color: string): void {
  form.set(
    props.path,
    list.value.map((c, i) => (i === index ? color : c)),
  );
}

// ---- lists ----
const items = computed(() => (isJson(props.schema.items) ? props.schema.items : {}));
const variants = computed(() => branches(items.value));
const list = computed(() => (Array.isArray(value.value) ? (value.value as unknown[]) : []));
const maxItems = computed(() => Number(props.schema.maxItems ?? 0));
const discriminator = computed(() =>
  typeof items.value.discriminator === 'string' ? items.value.discriminator : 'type',
);
const tagOf = (item: unknown): string => {
  const tag = isJson(item) ? item[discriminator.value] : undefined;
  return typeof tag === 'string' ? tag : '';
};
// Lists of plain values (numbers, texts, ...) edit each entry itself instead of object properties.
const scalarItems = computed(
  () => variants.value.length === 0 && fieldKind(items.value) !== 'object',
);
const minItems = computed(() => Number(props.schema.minItems ?? 0));
const canRemove = computed(() => list.value.length > minItems.value);
const usedTags = computed(() => new Set(list.value.map(tagOf)));
const addable = computed(() => variants.value.filter((v) => !usedTags.value.has(v.tag)));
const canAdd = computed(
  () =>
    list.value.length < maxItems.value && (variants.value.length === 0 || addable.value.length > 0),
);

function add(tag: string | null): void {
  const item = newItem(items.value, tag);
  if (item !== null) form.set(props.path, [...list.value, item]);
}
function removeAt(index: number): void {
  if (!canRemove.value) return;
  form.set(
    props.path,
    list.value.filter((_, i) => i !== index),
  );
}
function move(index: number, delta: -1 | 1): void {
  const next = [...list.value];
  const target = index + delta;
  if (target < 0 || target >= next.length) return;
  [next[index], next[target]] = [next[target], next[index]];
  form.set(props.path, next);
}
function schemaOf(item: unknown): Json {
  const variant = variants.value.find((v) => v.tag === tagOf(item));
  return variant ? variant.schema : items.value;
}
function titleOf(item: unknown): string {
  const variant = variants.value.find((v) => v.tag === tagOf(item));
  return variant ? effectText(variant.title) : title.value;
}
const addLabel = computed(() =>
  variants.value.length > 0 ? __('Add force or behaviour') : __('Add'),
);
</script>

<template>
  <div class="sws-fx-field" :data-kind="kind">
    <!-- numbers -->
    <template v-if="kind === 'integer' || kind === 'number'">
      <div class="sws-fx-field__head">
        <span :title="hint">{{ title }}</span>
        <input
          class="sws-fx-field__num"
          type="text"
          inputmode="decimal"
          :aria-label="title"
          :value="plainNumber(live)"
          @change="(e) => commitNumber((e.target as HTMLInputElement).value)"
          @keyup.enter="(e) => commitNumber((e.target as HTMLInputElement).value)"
        />
      </div>
      <q-slider
        v-model="live"
        :min="min"
        :max="max"
        :step="step"
        :aria-label="title"
        color="primary"
        @pan="(phase: string) => (phase === 'start' ? form.begin() : form.end())"
        @update:model-value="(v: number | null) => v !== null && form.set(path, v)"
      />
    </template>

    <q-toggle
      v-else-if="kind === 'boolean'"
      :model-value="value === true"
      :label="title"
      @update:model-value="(v: boolean) => form.set(path, v)"
    />

    <q-select
      v-else-if="kind === 'enum'"
      :model-value="String(value ?? '')"
      :options="options"
      emit-value
      map-options
      dense
      outlined
      :label="title"
      @update:model-value="(v: string) => form.set(path, v)"
    />

    <label v-else-if="kind === 'color'" class="sws-fx-field__color">
      <span :title="hint">{{ title }}</span>
      <input
        type="color"
        :value="String(value ?? '#ffffff')"
        :aria-label="title"
        @input="(e) => form.set(path, (e.target as HTMLInputElement).value)"
      />
    </label>

    <q-input
      v-else-if="kind === 'text'"
      :model-value="String(value ?? '')"
      dense
      outlined
      :label="title"
      :maxlength="Number(schema.maxLength ?? 200)"
      @update:model-value="(v: string | number | null) => form.set(path, String(v ?? ''))"
    />

    <!-- vectors -->
    <fieldset v-else-if="kind === 'vector'" class="sws-fx-field__group">
      <legend :title="hint">{{ title }}</legend>
      <div class="sws-fx-field__vector">
        <label v-for="(axis, index) in ['x', 'y', 'z']" :key="axis">
          <span>{{ axis }}</span>
          <input
            type="text"
            inputmode="decimal"
            :aria-label="`${title} ${axis}`"
            :value="plainNumber(vector[index] ?? 0)"
            @change="(e) => setVector(index, (e.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </fieldset>

    <!-- colour lists -->
    <fieldset v-else-if="kind === 'colors'" class="sws-fx-field__group">
      <legend>{{ title }}</legend>
      <div class="sws-fx-field__colors">
        <span v-for="(color, index) in list" :key="index" class="sws-fx-field__swatch">
          <input
            type="color"
            :value="String(color)"
            :aria-label="`${title} ${index + 1}`"
            @input="(e) => setColor(index, (e.target as HTMLInputElement).value)"
          />
          <button
            v-if="list.length > Math.max(1, minItems)"
            type="button"
            class="sws-fx-field__x"
            :aria-label="__('Remove')"
            @click="removeAt(index)"
          >
            ×
          </button>
        </span>
        <q-btn
          v-if="list.length < maxItems"
          flat
          dense
          no-caps
          icon="r_add"
          :label="__('Add')"
          @click="form.set(path, [...list, '#ffffff'])"
        />
      </div>
    </fieldset>

    <!-- groups -->
    <fieldset v-else-if="kind === 'object'" class="sws-fx-field__group">
      <legend :title="hint">{{ title }}</legend>
      <SchemaField
        v-for="[key, child] in propertyEntries(schema)"
        :key="key"
        :schema="child"
        :path="[...path, key]"
        :name="key"
      />
    </fieldset>

    <!-- lists of objects / variants -->
    <fieldset v-else-if="kind === 'list'" class="sws-fx-field__group">
      <legend :title="hint">{{ title }}</legend>
      <p v-if="list.length === 0" class="sws-fx-field__empty">{{ __('Nothing added yet.') }}</p>
      <div v-for="(item, index) in list" :key="index" class="sws-fx-field__item">
        <div class="sws-fx-field__itemhead">
          <strong>{{ titleOf(item) }}</strong>
          <span class="sws-fx-field__itemtools">
            <q-btn
              flat
              dense
              round
              size="sm"
              icon="r_arrow_upward"
              :aria-label="__('Move up')"
              :disable="index === 0"
              @click="move(index, -1)"
            />
            <q-btn
              flat
              dense
              round
              size="sm"
              icon="r_arrow_downward"
              :aria-label="__('Move down')"
              :disable="index === list.length - 1"
              @click="move(index, 1)"
            />
            <q-btn
              flat
              dense
              round
              size="sm"
              icon="r_delete"
              :aria-label="__('Remove')"
              :disable="!canRemove"
              @click="removeAt(index)"
            />
          </span>
        </div>
        <SchemaField
          v-if="scalarItems"
          :schema="items"
          :path="[...path, index]"
          :name="String(index + 1)"
        />
        <template v-for="[key, child] in propertyEntries(schemaOf(item))" v-else :key="key">
          <SchemaField
            v-if="key !== discriminator"
            :schema="child"
            :path="[...path, index, key]"
            :name="key"
          />
        </template>
      </div>
      <q-btn-dropdown
        v-if="variants.length > 0"
        flat
        dense
        no-caps
        icon="r_add"
        :label="addLabel"
        :disable="!canAdd"
      >
        <q-list dense>
          <q-item
            v-for="variant in addable"
            :key="variant.tag"
            v-close-popup
            clickable
            @click="add(variant.tag)"
          >
            <q-item-section>{{ effectText(variant.title) }}</q-item-section>
          </q-item>
        </q-list>
      </q-btn-dropdown>
      <q-btn
        v-else
        flat
        dense
        no-caps
        icon="r_add"
        :label="addLabel"
        :disable="!canAdd"
        @click="add(null)"
      />
    </fieldset>
  </div>
</template>

<style scoped>
.sws-fx-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.sws-fx-field__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--sws-muted);
}
.sws-fx-field__num {
  width: 72px;
  text-align: right;
  border: 1px solid var(--sws-border, #cbd5e1);
  border-radius: 4px;
  padding: 1px 4px;
  font: inherit;
  background: transparent;
  color: inherit;
}
.sws-fx-field__color {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--sws-muted);
}
.sws-fx-field__color input,
.sws-fx-field__swatch input {
  width: 36px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--sws-border, #cbd5e1);
  border-radius: 4px;
  background: transparent;
}
.sws-fx-field__group {
  margin: 0;
  padding: 6px 8px 8px;
  border: 1px solid var(--sws-border, #e2e8f0);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.sws-fx-field__group > legend {
  padding: 0 4px;
  font-size: 12px;
  color: var(--sws-muted);
}
.sws-fx-field__vector {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.sws-fx-field__vector label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--sws-muted);
}
.sws-fx-field__vector input {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--sws-border, #cbd5e1);
  border-radius: 4px;
  padding: 2px 4px;
  font: inherit;
  background: transparent;
  color: inherit;
}
.sws-fx-field__colors {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.sws-fx-field__swatch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.sws-fx-field__x {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  color: var(--sws-muted);
}
.sws-fx-field__empty {
  margin: 0;
  font-size: 12px;
  color: var(--sws-muted);
}
.sws-fx-field__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border-radius: 6px;
  background: rgba(100, 116, 139, 0.08);
}
.sws-fx-field__itemhead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}
.sws-fx-field__itemtools {
  display: inline-flex;
}
</style>
