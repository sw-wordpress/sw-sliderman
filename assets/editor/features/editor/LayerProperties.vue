<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
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
  type ShapeKind,
} from '@shared/types';
import { LINK_PATTERN } from '@shared/validate';
import { useEditorStore } from '@editor/stores/editor';
import { useInstalledFonts } from '@editor/composables/useInstalledFonts';
import { pickImage, previewOf } from '@editor/composables/useMediaPicker';
import { __, sprintf } from '@editor/i18n';
import { formatNumber } from '@editor/utils/format';
import { mutable } from '@editor/document/ops';
import { richPlainText } from '@shared/richtext';
import type { RichParagraph } from '@shared/types';
import NumberField from '@editor/components/fields/NumberField.vue';
import PercentSlider from '@editor/components/fields/PercentSlider.vue';
import OverrideState from '@editor/components/fields/OverrideState.vue';
import FocalPointField from '@editor/components/fields/FocalPointField.vue';
import AccordionSection from '@editor/components/AccordionSection.vue';
import EffectProperties from '@editor/features/effects/EffectProperties.vue';

const props = defineProps<{ layer: Layer }>();
const editor = useEditorStore();
const { available: installations, refresh: refreshFonts } = useInstalledFonts();
const router = useRouter();
// The font manager opens in its own tab so the editor state stays; new fonts appear on return.
const fontsHref = computed(() => router.resolve('/fonts').href);
function refreshOnFocus(): void {
  void refreshFonts().catch((error: unknown) => console.error(error));
}
onMounted(() => window.addEventListener('focus', refreshOnFocus));
onBeforeUnmount(() => window.removeEventListener('focus', refreshOnFocus));

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
const imageThumb = computed(() => {
  const id = props.layer.type === 'image' ? props.layer.content.attachmentId : null;
  return id === null ? null : (editor.media[id]?.url ?? null);
});

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
type ButtonStateKey = 'hoverBackgroundColor' | 'hoverColor' | 'focusOutlineColor';
/** Sets one optional state colour; `null` removes it again (= the layer's normal look). */
function setButtonState(key: ButtonStateKey, value: string | null): void {
  editor.updateLayer(props.layer.id, (layer) => {
    if (layer.type !== 'button') return;
    if (value === null) delete layer.content[key];
    else layer.content[key] = value;
  });
}
const buttonStates = computed<Array<{ key: ButtonStateKey; label: string; fallback: string }>>(
  () => [
    {
      key: 'hoverBackgroundColor',
      label: __('Background on hover'),
      fallback: props.layer.style.backgroundColor ?? '#000000',
    },
    { key: 'hoverColor', label: __('Text on hover'), fallback: props.layer.style.color },
    { key: 'focusOutlineColor', label: __('Focus outline'), fallback: props.layer.style.color },
  ],
);

const shapeKind = computed(() => (props.layer.type === 'shape' ? props.layer.content.kind : null));
const shapeKinds = computed<Array<{ value: ShapeKind; label: string; icon: string }>>(() => [
  { value: 'rectangle', label: __('Rectangle'), icon: 'r_crop_square' },
  { value: 'circle', label: __('Circle'), icon: 'r_circle' },
]);
function setShapeKind(kind: ShapeKind): void {
  editor.updateLayer(props.layer.id, (layer) => {
    if (layer.type === 'shape') layer.content.kind = kind;
  });
}
const imageLink = computed(() => {
  const content = props.layer.type === 'image' ? props.layer.content : null;
  return { url: content?.linkUrl ?? '', newTab: content?.linkNewTab ?? false };
});
const imageLinkValid = computed(
  () => !imageLink.value.url || LINK_PATTERN.test(imageLink.value.url),
);
function setImageLink(key: 'linkUrl' | 'linkNewTab', value: string | boolean): void {
  editor.updateLayer(props.layer.id, (layer) => {
    if (layer.type !== 'image') return;
    if (key === 'linkUrl') layer.content.linkUrl = String(value).trim();
    else layer.content.linkNewTab = value === true;
  });
}
// The link box is opened by a checkbox; a stored link keeps it open. Unchecking removes the link.
const linkOpen = ref(imageLink.value.url !== '');
function toggleImageLink(on: boolean): void {
  linkOpen.value = on;
  if (on) return;
  editor.updateLayer(props.layer.id, (layer) => {
    if (layer.type !== 'image') return;
    layer.content.linkUrl = '';
    layer.content.linkNewTab = false;
  });
}
/** Sensible first look: a soft, slightly lowered shadow instead of an invisible 0/0/0 one. */
function toggleShadow(on: boolean): void {
  editor.updateLayer(props.layer.id, (layer) => {
    if (!on) {
      layer.style.shadowColor = null;
      return;
    }
    layer.style.shadowColor = layer.style.shadowColor ?? '#000000';
    if (!layer.style.shadowX && !layer.style.shadowY && !layer.style.shadowBlur) {
      layer.style.shadowX = 0;
      layer.style.shadowY = 4;
      layer.style.shadowBlur = 12;
      layer.style.shadowOpacity = 0.25;
    }
  });
}
// The rich text editor and its library load only when a text layer is edited.
const RichTextEditor = defineAsyncComponent(() => import('./RichTextEditor.vue'));
/** Stores the structured text and its plain-text mirror in one undo step. */
function commitRich(rich: RichParagraph[]): void {
  editor.updateLayer(props.layer.id, (layer) => {
    if (layer.type !== 'text') return;
    layer.content.rich = mutable(rich);
    layer.content.text = richPlainText(rich);
  });
}
const imageUrl = computed(() => {
  const id = props.layer.type === 'image' ? props.layer.content.attachmentId : null;
  return id === null ? null : (editor.media[id]?.url ?? null);
});
function setImageFocal(point: { x: number; y: number }): void {
  editor.updateLayer(props.layer.id, (layer) => {
    if (layer.type !== 'image') return;
    layer.content.focalX = point.x;
    layer.content.focalY = point.y;
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
  'reveal-left': () => __('Masked reveal from left'),
  'reveal-circle': () => __('Circular reveal'),
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
// ---------- header and collapsed summaries ----------
const typeIcons: Record<Layer['type'], string> = {
  text: 'r_title',
  image: 'r_image',
  button: 'r_smart_button',
  shape: 'r_category',
  effect: 'r_auto_awesome',
};
const typeIcon = computed(() => typeIcons[props.layer.type]);
const typeLabel = computed(
  () =>
    ({
      text: __('Text layer'),
      image: __('Image layer'),
      button: __('Button layer'),
      shape: __('Shape layer'),
      effect: __('Effect layer'),
    })[props.layer.type],
);
const contentSummary = computed(() => {
  const l = props.layer;
  if (l.type === 'text') return l.content.text.slice(0, 40);
  if (l.type === 'button') return l.content.label;
  if (l.type === 'image') return l.content.decorative ? __('Decorative') : l.content.alt;
  if (l.type === 'effect') return l.content.effect;
  return l.content.kind === 'circle' ? __('Circle') : __('Rectangle');
});
const layoutSummary = computed(
  () =>
    `${formatNumber(layout.value.x)}, ${formatNumber(layout.value.y)} · ${formatNumber(layout.value.width)} × ${formatNumber(layout.value.height)}`,
);
const typographySummary = computed(
  () => `${formatNumber(style.value.fontSize)} px · ${formatNumber(style.value.lineHeight)}`,
);
const boxSummary = computed(
  () =>
    `${formatNumber(style.value.paddingX)} px · R ${formatNumber(style.value.borderRadius)} · ${Math.round(style.value.opacity * 100)} %`,
);
const borderSummary = computed(
  () =>
    `${formatNumber(style.value.borderWidth ?? 0)} px · ${style.value.shadowColor ? __('Shadow') : __('no shadow')}`,
);
const animationSummary = computed(() => {
  const enter = props.layer.animation.enter;
  if (enter.preset === 'none') return __('None');
  const label = presetLabels[enter.preset]?.() ?? enter.preset;
  return `${label} · ${enter.startMs}–${enter.startMs + enter.durationMs} ms`;
});
</script>

<template>
  <div class="sws-props">
    <header class="sws-layerhead">
      <span class="sws-layerhead__icon" aria-hidden="true">
        <q-icon :name="typeIcon" size="20px" />
      </span>
      <label class="sws-layerhead__name">
        <span>{{ typeLabel }}</span>
        <input
          :value="layer.name"
          :maxlength="LIMITS.nameLength"
          :aria-label="__('Layer name')"
          @change="
            (e) =>
              editor.updateLayer(layer.id, (l) => (l.name = (e.target as HTMLInputElement).value))
          "
        />
      </label>
      <q-btn
        flat
        dense
        round
        size="sm"
        :icon="layout.visible ? 'r_visibility' : 'r_visibility_off'"
        :aria-label="
          layout.visible ? __('Hide on this screen size') : __('Show on this screen size')
        "
        :aria-pressed="!layout.visible"
        @click="setLayout('visible', !layout.visible)"
      />
      <q-btn
        flat
        dense
        round
        size="sm"
        :icon="layer.locked ? 'r_lock' : 'r_lock_open'"
        :aria-label="layer.locked ? __('Unlock layer') : __('Lock layer')"
        :aria-pressed="layer.locked"
        @click="editor.updateLayer(layer.id, (l) => (l.locked = !l.locked))"
      />
    </header>

    <!-- content -->
    <EffectProperties v-if="layer.type === 'effect'" :layer="layer" />
    <AccordionSection v-else id="layer.content" :title="__('Content')" default-open>
      <template #summary>{{ contentSummary }}</template>
      <template v-if="layer.type === 'text'">
        <RichTextEditor
          :key="layer.id"
          :rich="layer.content.rich"
          :text="layer.content.text"
          @commit="commitRich"
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
        <div class="sws-image-pick">
          <img
            v-if="imageThumb"
            class="sws-image-pick__thumb"
            :src="imageThumb"
            alt=""
            width="64"
            height="64"
          />
          <q-btn
            outline
            no-caps
            icon="r_photo_library"
            :label="layer.content.attachmentId ? __('Replace image') : __('Choose image')"
            @click="chooseImage"
          />
        </div>
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
        <FocalPointField
          v-if="layer.type === 'image' && imageUrl"
          :src="imageUrl"
          :x="layer.content.focalX ?? 50"
          :y="layer.content.focalY ?? 50"
          @commit="setImageFocal"
        />
        <q-checkbox
          :model-value="linkOpen"
          :label="__('Open link')"
          @update:model-value="toggleImageLink"
        />
        <div v-if="linkOpen" class="sws-props__box">
          <q-input
            :model-value="imageLink.url"
            dense
            outlined
            :label="__('Link address')"
            :maxlength="LIMITS.urlLength"
            :error="!imageLinkValid"
            :error-message="__('Use https://, mailto:, tel:, / or #.')"
            @change="(v: string | number | null) => setImageLink('linkUrl', String(v ?? ''))"
          />
          <q-toggle
            :model-value="imageLink.newTab"
            :label="__('Open in a new tab')"
            @update:model-value="(v: boolean) => setImageLink('linkNewTab', v)"
          />
        </div>
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
        <div class="sws-props__box">
          <strong class="sws-props__box-title">{{ __('Button states') }}</strong>
          <div v-for="state in buttonStates" :key="state.key" class="sws-props__color-row">
            <label class="sws-props__color">
              <span>{{ state.label }}</span>
              <input
                type="color"
                :value="button?.[state.key] ?? state.fallback"
                @change="(e) => setButtonState(state.key, (e.target as HTMLInputElement).value)"
              />
            </label>
            <q-btn
              v-if="button?.[state.key] !== undefined"
              flat
              dense
              no-caps
              size="sm"
              :label="__('Default')"
              @click="setButtonState(state.key, null)"
            />
          </div>
        </div>
      </template>
      <template v-else-if="shapeKind">
        <q-btn-toggle
          :model-value="shapeKind"
          unelevated
          dense
          no-caps
          toggle-color="primary"
          :options="shapeKinds"
          :aria-label="__('Shape')"
          @update:model-value="setShapeKind"
        />
      </template>
    </AccordionSection>

    <!-- layout -->
    <AccordionSection id="layer.layout" :title="__('Position and size')" default-open>
      <template #summary>{{ layoutSummary }}</template>
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
    </AccordionSection>

    <!-- typography -->
    <AccordionSection
      v-if="layer.type !== 'image' && layer.type !== 'shape' && layer.type !== 'effect'"
      id="layer.typography"
      :title="__('Typography')"
    >
      <template #summary>{{ typographySummary }}</template>
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
      <a class="sws-props__link" :href="fontsHref" target="_blank" rel="noopener">
        <q-icon name="r_font_download" size="16px" aria-hidden="true" />
        {{ installations.length === 0 ? __('Install fonts') : __('Manage fonts') }}
      </a>
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
    </AccordionSection>

    <!-- box -->
    <AccordionSection id="layer.box" :title="__('Box')">
      <template #summary>
        <span class="sws-swatch" :style="{ background: style.backgroundColor ?? 'transparent' }" />
        {{ boxSummary }}
      </template>
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
        <div v-if="layer.type !== 'shape'" class="sws-props__field">
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
        <div v-if="layer.type !== 'shape'" class="sws-props__field">
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
          v-if="shapeKind !== 'circle'"
          :model-value="style.borderRadius"
          :label="__('Corner radius')"
          suffix="px"
          :min="0"
          :max="LIMITS.radiusMax"
          @commit="(v) => setStyle('borderRadius', v)"
        />
        <PercentSlider
          :model-value="Math.round(style.opacity * 100)"
          :label="__('Opacity')"
          :min="0"
          :max="100"
          @commit="(v) => setStyle('opacity', v / 100)"
        />
      </div>
    </AccordionSection>

    <!-- border and shadow -->
    <AccordionSection id="layer.border" :title="__('Border and shadow')">
      <template #summary>
        <span class="sws-swatch" :style="{ background: style.borderColor ?? 'transparent' }" />
        {{ borderSummary }}
      </template>
      <div class="sws-props__grid">
        <NumberField
          :model-value="style.borderWidth ?? 0"
          :label="__('Border width')"
          suffix="px"
          :min="0"
          :max="LIMITS.borderWidthMax"
          @commit="(v) => setStyle('borderWidth', v)"
        />
        <label class="sws-props__color">
          <span>{{ __('Border colour') }}</span>
          <input
            type="color"
            :value="style.borderColor ?? '#000000'"
            @change="(e) => setStyle('borderColor', (e.target as HTMLInputElement).value)"
          />
        </label>
      </div>
      <q-toggle
        :model-value="!!style.shadowColor"
        :label="__('Shadow')"
        @update:model-value="toggleShadow"
      />
      <template v-if="style.shadowColor">
        <div class="sws-props__grid">
          <NumberField
            :model-value="style.shadowX ?? 0"
            :label="__('Shadow offset X')"
            suffix="px"
            :min="-LIMITS.shadowOffsetMax"
            :max="LIMITS.shadowOffsetMax"
            @commit="(v) => setStyle('shadowX', v)"
          />
          <NumberField
            :model-value="style.shadowY ?? 0"
            :label="__('Shadow offset Y')"
            suffix="px"
            :min="-LIMITS.shadowOffsetMax"
            :max="LIMITS.shadowOffsetMax"
            @commit="(v) => setStyle('shadowY', v)"
          />
          <NumberField
            :model-value="style.shadowBlur ?? 0"
            :label="__('Shadow blur')"
            suffix="px"
            :min="0"
            :max="LIMITS.shadowBlurMax"
            @commit="(v) => setStyle('shadowBlur', v)"
          />
          <PercentSlider
            :model-value="Math.round((style.shadowOpacity ?? 0.25) * 100)"
            :label="__('Shadow opacity')"
            :min="0"
            :max="100"
            @commit="(v) => setStyle('shadowOpacity', v / 100)"
          />
        </div>
        <label class="sws-props__color">
          <span>{{ __('Shadow colour') }}</span>
          <input
            type="color"
            :value="style.shadowColor"
            @change="(e) => setStyle('shadowColor', (e.target as HTMLInputElement).value)"
          />
        </label>
      </template>
    </AccordionSection>

    <!-- animation -->
    <AccordionSection id="layer.animation" :title="__('Animation')">
      <template #summary>{{ animationSummary }}</template>
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
    </AccordionSection>
  </div>
</template>

<style scoped src="./props.css"></style>
<style scoped>
.sws-layerhead {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 14px 16px;
}
.sws-layerhead__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--sws-primary);
  color: #fff;
}
.sws-layerhead__name {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  font-size: 11px;
  color: var(--sws-muted);
}
.sws-layerhead__name input {
  min-width: 0;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--sws-text);
  font: inherit;
  font-size: 15px;
  font-weight: 600;
}
.sws-layerhead__name input:focus-visible {
  outline: 2px solid var(--sws-focus);
  outline-offset: 2px;
}
.sws-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 1px solid var(--sws-border);
  border-radius: 3px;
}
</style>
