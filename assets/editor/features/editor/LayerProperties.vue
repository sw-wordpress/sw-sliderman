<script setup lang="ts">
import { computed } from 'vue';
import { LIMITS } from '@shared/limits';
import { overflowsStage, resolveLayer } from '@shared/layout';
import {
  ANIMATION_PRESETS,
  EASINGS,
  TEXT_TAGS,
  type AnimationPhase,
  type ButtonContent,
  type Layer,
  type LayerLayout,
  type LayerStyle,
} from '@shared/types';
import { LINK_PATTERN } from '@shared/validate';
import { useEditorStore } from '@editor/stores/editor';
import { useInstalledFonts } from '@editor/composables/useInstalledFonts';
import { pickImage, previewOf } from '@editor/composables/useMediaPicker';
import { __, sprintf } from '@editor/i18n';
import { formatNumber } from '@editor/utils/format';
import NumberField from '@editor/components/fields/NumberField.vue';
import OverrideState from '@editor/components/fields/OverrideState.vue';

const props = defineProps<{ layer: Layer }>();
const editor = useEditorStore();
const { available: installations } = useInstalledFonts();

const resolved = computed(() => {
  const doc = editor.document;
  return doc ? resolveLayer(props.layer, editor.device, doc.breakpoints) : null;
});
const layout = computed<LayerLayout>(() => resolved.value?.layout ?? props.layer.layout);
const style = computed<LayerStyle>(() => resolved.value?.style ?? props.layer.style);
const overflow = computed(() => {
  const stage = editor.stage;
  return resolved.value && stage
    ? overflowsStage(resolved.value.box, stage.stageWidth, stage.stageHeight)
    : false;
});

/** Smallest rendered font size on the edited screen size (container at its minimum width). */
const minRenderedFont = computed(() => {
  const doc = editor.document;
  if (!doc || props.layer.type === 'image') return null;
  const bp = doc.breakpoints[editor.device];
  const minContainer = editor.device === 'mobile' ? 320 : bp.minWidth;
  return (style.value.fontSize * Math.min(minContainer, bp.stageWidth)) / bp.stageWidth;
});

function setLayout<K extends keyof LayerLayout>(key: K, value: LayerLayout[K]): void {
  editor.setLayout(props.layer.id, key, value);
}
function setStyle<K extends keyof LayerStyle>(key: K, value: LayerStyle[K]): void {
  editor.setStyle(props.layer.id, key, value);
}

// ---------- fonts (installed, local only) ----------
interface FontOption {
  label: string;
  value: string;
  font: { installationId: string; weight: number; style: 'normal' | 'italic' } | null;
}
const fontOptions = computed<FontOption[]>(() => [
  { label: __('System font'), value: 'system', font: null },
  ...installations.value.flatMap((installation) =>
    installation.variants.map((variant) => ({
      label: `${installation.family} ${variant.weight}${variant.style === 'italic' ? ' ' + __('italic') : ''} · ${installation.id.slice(-6)}`,
      value: `${installation.id}|${variant.weight}|${variant.style}`,
      font: { installationId: installation.id, weight: variant.weight, style: variant.style },
    })),
  ),
]);
const currentFont = computed(() => {
  const ref = editor.document?.fontRefs.find((f) => f.id === props.layer.style.fontRef);
  return ref ? `${ref.installationId}|${ref.weight}|${ref.style}` : 'system';
});
const fontMissing = computed(
  () =>
    currentFont.value !== 'system' && !fontOptions.value.some((o) => o.value === currentFont.value),
);
function setFont(value: string): void {
  editor.setLayerFont(
    props.layer.id,
    fontOptions.value.find((o) => o.value === value)?.font ?? null,
  );
}

// ---------- content ----------
async function chooseImage(): Promise<void> {
  const attachment = await pickImage();
  if (!attachment || props.layer.type !== 'image') return;
  editor.rememberMedia(attachment.id, previewOf(attachment));
  editor.updateLayer(props.layer.id, (layer) => {
    if (layer.type !== 'image') return;
    layer.content.attachmentId = attachment.id;
    if (layer.content.alt === '' && attachment.alt)
      layer.content.alt = attachment.alt.slice(0, LIMITS.altLength);
  });
}

const button = computed(() => (props.layer.type === 'button' ? props.layer.content : null));
function setButton<K extends keyof ButtonContent>(key: K, value: ButtonContent[K]): void {
  editor.updateLayer(props.layer.id, (layer) => {
    if (layer.type === 'button')
      Object.assign(layer.content, { [key]: key === 'url' ? String(value).trim() : value });
  });
}
const urlValid = computed(() => button.value === null || LINK_PATTERN.test(button.value.url));

// ---------- animation ----------
const presetLabels: Record<string, () => string> = {
  none: () => __('None'),
  fade: () => __('Fade'),
  'slide-up': () => __('From below'),
  'slide-down': () => __('From above'),
  'slide-left': () => __('From the right'),
  'slide-right': () => __('From the left'),
  'zoom-in': () => __('Zoom in'),
  'zoom-out': () => __('Zoom out'),
  rotate: () => __('Rotate'),
};
const presetOptions = computed(() =>
  ANIMATION_PRESETS.map((value) => ({ value, label: presetLabels[value]?.() ?? value })),
);
const easingOptions = EASINGS.map((value) => ({ value, label: value }));

function setEnter<K extends keyof AnimationPhase>(key: K, value: AnimationPhase[K]): void {
  editor.updateLayer(props.layer.id, (layer) => {
    Object.assign(layer.animation.enter, { [key]: value });
  });
}
function setExitMode(mode: 'slide-end' | 'timed'): void {
  editor.updateLayer(props.layer.id, (layer) => {
    const enter = layer.animation.enter;
    layer.animation.exit =
      mode === 'slide-end'
        ? { mode }
        : {
            mode,
            preset: 'fade',
            startMs: Math.max(enter.startMs + enter.durationMs, 3000),
            durationMs: 400,
            easing: 'ease-in',
            distance: 40,
          };
  });
}
function setExit<K extends keyof AnimationPhase>(key: K, value: AnimationPhase[K]): void {
  editor.updateLayer(props.layer.id, (layer) => {
    if (layer.animation.exit.mode === 'timed')
      Object.assign(layer.animation.exit, { [key]: value });
  });
}
const tagOptions = TEXT_TAGS.map((tag) => ({
  value: tag,
  label:
    tag === 'div'
      ? __('Text block (div)')
      : tag === 'p'
        ? __('Paragraph (p)')
        : sprintf(__('Heading %s'), tag.toUpperCase()),
}));
const anchorX = [
  { value: 'left', label: __('left') },
  { value: 'center', label: __('centre') },
  { value: 'right', label: __('right') },
];
const anchorY = [
  { value: 'top', label: __('top') },
  { value: 'center', label: __('centre') },
  { value: 'bottom', label: __('bottom') },
];
</script>

<template>
  <div class="sws-props">
    <q-input
      :model-value="layer.name"
      dense
      outlined
      :label="__('Layer name')"
      :maxlength="LIMITS.nameLength"
      @change="(v: string) => editor.updateLayer(layer.id, (l) => (l.name = String(v)))"
    />

    <!-- content -->
    <section class="sws-props__section">
      <h3>{{ __('Content') }}</h3>
      <template v-if="layer.type === 'text'">
        <q-input
          :model-value="layer.content.text"
          type="textarea"
          autogrow
          outlined
          dense
          :label="__('Text')"
          :maxlength="LIMITS.textLength"
          @change="
            (v: string) =>
              editor.updateLayer(layer.id, (l) => {
                if (l.type === 'text') l.content.text = String(v);
              })
          "
        />
        <q-select
          :model-value="layer.content.tag"
          :options="tagOptions"
          emit-value
          map-options
          dense
          outlined
          :label="__('Semantic element')"
          @update:model-value="
            (v) =>
              editor.updateLayer(layer.id, (l) => {
                if (l.type === 'text') l.content.tag = v;
              })
          "
        />
      </template>
      <template v-else-if="layer.type === 'image'">
        <q-btn
          outline
          no-caps
          icon="r_photo_library"
          :label="layer.content.attachmentId ? __('Replace image') : __('Choose image')"
          @click="chooseImage"
        />
        <q-toggle
          :model-value="layer.content.decorative"
          :label="__('Decorative (no alternative text)')"
          @update:model-value="
            (v: boolean) =>
              editor.updateLayer(layer.id, (l) => {
                if (l.type === 'image') l.content.decorative = v;
              })
          "
        />
        <q-input
          v-if="!layer.content.decorative"
          :model-value="layer.content.alt"
          dense
          outlined
          :label="__('Alternative text')"
          :maxlength="LIMITS.altLength"
          @change="
            (v: string) =>
              editor.updateLayer(layer.id, (l) => {
                if (l.type === 'image') l.content.alt = String(v);
              })
          "
        />
        <q-btn-toggle
          :model-value="layer.content.fit"
          no-caps
          unelevated
          toggle-color="primary"
          :options="[
            { value: 'cover', label: __('Fill') },
            { value: 'contain', label: __('Fit') },
          ]"
          @update:model-value="
            (v) =>
              editor.updateLayer(layer.id, (l) => {
                if (l.type === 'image') l.content.fit = v;
              })
          "
        />
        <div class="sws-props__grid">
          <q-btn
            outline
            dense
            no-caps
            :label="__('100% stage width')"
            :disable="layer.locked"
            @click="editor.fitImage(layer.id, 'width')"
          />
          <q-btn
            outline
            dense
            no-caps
            :label="__('100% stage height')"
            :disable="layer.locked"
            @click="editor.fitImage(layer.id, 'height')"
          />
        </div>
      </template>
      <template v-else-if="button">
        <q-input
          :model-value="button.label"
          dense
          outlined
          :label="__('Label')"
          :maxlength="LIMITS.buttonLabelLength"
          @change="(v: string) => setButton('label', String(v))"
        />
        <q-input
          :model-value="button?.url ?? ''"
          dense
          outlined
          type="url"
          :label="__('Link')"
          :error="!urlValid"
          :error-message="__('Allowed: https://…, http://…, mailto:, tel:, /path or #anchor')"
          :maxlength="LIMITS.urlLength"
          @change="(v: string) => setButton('url', String(v))"
        />
        <q-toggle
          :model-value="button?.newTab ?? false"
          :label="__('Open in a new tab')"
          @update:model-value="(v: boolean) => setButton('newTab', v)"
        />
      </template>
    </section>

    <!-- layout -->
    <section class="sws-props__section">
      <h3>{{ __('Position and size') }}</h3>
      <p v-if="overflow" class="sws-props__warn" role="status">
        <q-icon name="r_warning" aria-hidden="true" />
        {{ __('The layer extends beyond the stage on this screen size.') }}
      </p>
      <div class="sws-props__grid">
        <div
          v-for="key in ['x', 'y', 'width', 'height', 'rotation'] as const"
          :key="key"
          class="sws-props__field"
        >
          <NumberField
            :model-value="layout[key]"
            :label="
              {
                x: 'X',
                y: 'Y',
                width: __('Width'),
                height: __('Height'),
                rotation: __('Rotation'),
              }[key]
            "
            :suffix="key === 'rotation' ? '°' : 'px'"
            :min="
              key === 'width' || key === 'height'
                ? LIMITS.sizeMin
                : key === 'rotation'
                  ? -LIMITS.rotationMax
                  : -LIMITS.coordinate
            "
            :max="
              key === 'width' || key === 'height'
                ? LIMITS.sizeMax
                : key === 'rotation'
                  ? LIMITS.rotationMax
                  : LIMITS.coordinate
            "
            @commit="(v) => setLayout(key, v)"
          />
          <OverrideState :layer="layer" group="layout" :field="key" />
        </div>
      </div>
      <div class="sws-props__grid">
        <div class="sws-props__field">
          <q-select
            :model-value="layout.anchorX"
            :options="anchorX"
            emit-value
            map-options
            dense
            outlined
            :label="__('Horizontal anchor')"
            @update:model-value="(v) => setLayout('anchorX', v)"
          />
          <OverrideState :layer="layer" group="layout" field="anchorX" />
        </div>
        <div class="sws-props__field">
          <q-select
            :model-value="layout.anchorY"
            :options="anchorY"
            emit-value
            map-options
            dense
            outlined
            :label="__('Vertical anchor')"
            @update:model-value="(v) => setLayout('anchorY', v)"
          />
          <OverrideState :layer="layer" group="layout" field="anchorY" />
        </div>
      </div>
      <div class="sws-props__field">
        <q-toggle
          :model-value="layout.visible"
          :label="__('Visible on this screen size')"
          @update:model-value="(v: boolean) => setLayout('visible', v)"
        />
        <OverrideState :layer="layer" group="layout" field="visible" />
      </div>
    </section>

    <!-- typography -->
    <section v-if="layer.type !== 'image'" class="sws-props__section">
      <h3>{{ __('Typography') }}</h3>
      <q-select
        :model-value="currentFont"
        :options="fontOptions"
        emit-value
        map-options
        dense
        outlined
        :label="__('Font (locally installed)')"
        @update:model-value="setFont"
      />
      <p v-if="fontMissing" class="sws-props__warn" role="status">
        <q-icon name="r_warning" aria-hidden="true" />
        {{ __('This font is not installed; the system font is shown.') }}
      </p>
      <p
        v-if="minRenderedFont !== null && minRenderedFont < 12"
        class="sws-props__warn"
        role="status"
      >
        <q-icon name="r_text_decrease" aria-hidden="true" />
        {{
          sprintf(
            __(
              'On the smallest screens of this size the text is only %s px. Set a larger font size here.',
            ),
            formatNumber(minRenderedFont),
          )
        }}
      </p>
      <div class="sws-props__grid">
        <div class="sws-props__field">
          <NumberField
            :model-value="style.fontSize"
            :label="__('Font size')"
            suffix="px"
            :min="LIMITS.fontSizeMin"
            :max="LIMITS.fontSizeMax"
            @commit="(v) => setStyle('fontSize', v)"
          />
          <OverrideState :layer="layer" group="style" field="fontSize" />
        </div>
        <div class="sws-props__field">
          <NumberField
            :model-value="style.lineHeight"
            :label="__('Line height')"
            :step="0.1"
            :min="LIMITS.lineHeightMin"
            :max="LIMITS.lineHeightMax"
            @commit="(v) => setStyle('lineHeight', v)"
          />
          <OverrideState :layer="layer" group="style" field="lineHeight" />
        </div>
        <div class="sws-props__field">
          <NumberField
            :model-value="style.letterSpacing"
            :label="__('Letter spacing')"
            suffix="px"
            :step="0.1"
            :min="LIMITS.letterSpacingMin"
            :max="LIMITS.letterSpacingMax"
            @commit="(v) => setStyle('letterSpacing', v)"
          />
          <OverrideState :layer="layer" group="style" field="letterSpacing" />
        </div>
        <div class="sws-props__field">
          <q-btn-toggle
            :model-value="style.textAlign"
            unelevated
            dense
            toggle-color="primary"
            :options="[
              {
                value: 'left',
                icon: 'r_format_align_left',
                attrs: { 'aria-label': __('Align left') },
              },
              {
                value: 'center',
                icon: 'r_format_align_center',
                attrs: { 'aria-label': __('Centre') },
              },
              {
                value: 'right',
                icon: 'r_format_align_right',
                attrs: { 'aria-label': __('Align right') },
              },
            ]"
            @update:model-value="(v) => setStyle('textAlign', v)"
          />
          <OverrideState :layer="layer" group="style" field="textAlign" />
        </div>
      </div>
      <label class="sws-props__color">
        <span>{{ __('Text colour') }}</span>
        <input
          type="color"
          :value="style.color"
          @change="(e) => setStyle('color', (e.target as HTMLInputElement).value)"
        />
      </label>
    </section>

    <!-- box -->
    <section class="sws-props__section">
      <h3>{{ __('Box') }}</h3>
      <div class="sws-props__color-row">
        <label class="sws-props__color">
          <span>{{ __('Background') }}</span>
          <input
            type="color"
            :value="style.backgroundColor ?? '#000000'"
            @change="(e) => setStyle('backgroundColor', (e.target as HTMLInputElement).value)"
          />
        </label>
        <q-btn
          v-if="style.backgroundColor !== null"
          flat
          dense
          no-caps
          size="sm"
          :label="__('Transparent')"
          @click="setStyle('backgroundColor', null)"
        />
      </div>
      <div class="sws-props__grid">
        <div class="sws-props__field">
          <NumberField
            :model-value="style.paddingX"
            :label="__('Padding horizontal')"
            suffix="px"
            :min="0"
            :max="LIMITS.paddingMax"
            @commit="(v) => setStyle('paddingX', v)"
          />
          <OverrideState :layer="layer" group="style" field="paddingX" />
        </div>
        <div class="sws-props__field">
          <NumberField
            :model-value="style.paddingY"
            :label="__('Padding vertical')"
            suffix="px"
            :min="0"
            :max="LIMITS.paddingMax"
            @commit="(v) => setStyle('paddingY', v)"
          />
          <OverrideState :layer="layer" group="style" field="paddingY" />
        </div>
        <NumberField
          :model-value="style.borderRadius"
          :label="__('Corner radius')"
          suffix="px"
          :min="0"
          :max="LIMITS.radiusMax"
          @commit="(v) => setStyle('borderRadius', v)"
        />
        <NumberField
          :model-value="Math.round(style.opacity * 100)"
          :label="__('Opacity')"
          suffix="%"
          :min="0"
          :max="100"
          integer
          @commit="(v) => setStyle('opacity', v / 100)"
        />
      </div>
    </section>

    <!-- animation -->
    <section class="sws-props__section">
      <h3>{{ __('Animation') }}</h3>
      <q-select
        :model-value="layer.animation.enter.preset"
        :options="presetOptions"
        emit-value
        map-options
        dense
        outlined
        :label="__('Entrance')"
        @update:model-value="(v) => setEnter('preset', v)"
      />
      <div v-if="layer.animation.enter.preset !== 'none'" class="sws-props__grid">
        <NumberField
          :model-value="layer.animation.enter.startMs"
          :label="__('Start')"
          suffix="ms"
          integer
          :min="0"
          :max="LIMITS.animationStartMaxMs"
          @commit="(v) => setEnter('startMs', v)"
        />
        <NumberField
          :model-value="layer.animation.enter.durationMs"
          :label="__('Duration')"
          suffix="ms"
          integer
          :min="0"
          :max="LIMITS.animationDurationMaxMs"
          @commit="(v) => setEnter('durationMs', v)"
        />
        <q-select
          :model-value="layer.animation.enter.easing"
          :options="easingOptions"
          emit-value
          map-options
          dense
          outlined
          :label="__('Easing')"
          @update:model-value="(v) => setEnter('easing', v)"
        />
        <NumberField
          v-if="layer.animation.enter.preset.startsWith('slide')"
          :model-value="layer.animation.enter.distance"
          :label="__('Distance')"
          suffix="px"
          :min="0"
          :max="LIMITS.animationDistanceMax"
          @commit="(v) => setEnter('distance', v)"
        />
      </div>
      <q-btn-toggle
        :model-value="layer.animation.exit.mode"
        no-caps
        unelevated
        dense
        toggle-color="primary"
        :options="[
          { value: 'slide-end', label: __('Visible until slide end') },
          { value: 'timed', label: __('Timed exit') },
        ]"
        @update:model-value="setExitMode"
      />
      <div v-if="layer.animation.exit.mode === 'timed'" class="sws-props__grid">
        <q-select
          :model-value="layer.animation.exit.preset"
          :options="presetOptions"
          emit-value
          map-options
          dense
          outlined
          :label="__('Exit')"
          @update:model-value="(v) => setExit('preset', v)"
        />
        <NumberField
          :model-value="layer.animation.exit.startMs"
          :label="__('Start')"
          suffix="ms"
          integer
          :min="0"
          :max="LIMITS.animationStartMaxMs"
          @commit="(v) => setExit('startMs', v)"
        />
        <NumberField
          :model-value="layer.animation.exit.durationMs"
          :label="__('Duration')"
          suffix="ms"
          integer
          :min="0"
          :max="LIMITS.animationDurationMaxMs"
          @commit="(v) => setExit('durationMs', v)"
        />
      </div>
    </section>
  </div>
</template>

<style scoped src="./props.css"></style>
