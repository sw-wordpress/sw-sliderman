<script setup lang="ts">
import { computed } from 'vue';
import { LIMITS } from '@shared/limits';
import { scheduleSlide } from '@shared/schedule';
import type { BreakpointName, Slide } from '@shared/types';
import { useEditorStore } from '@editor/stores/editor';
import { pickImage, previewOf } from '@editor/composables/useMediaPicker';
import { __, sprintf } from '@editor/i18n';
import NumberField from '@editor/components/fields/NumberField.vue';
import PercentSlider from '@editor/components/fields/PercentSlider.vue';
import FocalPointField from '@editor/components/fields/FocalPointField.vue';
import { DEFAULT_FOCAL, DEFAULT_OVERLAY_OPACITY } from '@shared/types';

const props = defineProps<{ slide: Slide; scope?: 'slide' | 'slider' }>();
const editor = useEditorStore();

const schedule = computed(() => scheduleSlide(props.slide));
const settings = computed(() => editor.document?.settings);
const breakpoints = computed(() => editor.document?.breakpoints);

async function chooseBackground(): Promise<void> {
  const attachment = await pickImage();
  if (!attachment) return;
  editor.rememberMedia(attachment.id, previewOf(attachment));
  editor.updateSlide(props.slide.id, (slide) => {
    slide.background.attachmentId = attachment.id;
  });
}

const backgroundUrl = computed(() => {
  const id = props.slide.background.attachmentId;
  return id === null ? null : (editor.media[id]?.url ?? null);
});
const overlayOn = computed(() => !!props.slide.background.overlayColor);
/** Sensible first look: a black overlay at 40 % instead of an invisible one. */
function toggleOverlay(on: boolean): void {
  editor.updateSlide(props.slide.id, (slide) => {
    if (!on) {
      slide.background.overlayColor = null;
      return;
    }
    slide.background.overlayColor = slide.background.overlayColor || '#000000';
    slide.background.overlayOpacity ??= DEFAULT_OVERLAY_OPACITY;
  });
}
function setBackgroundFocal(point: { x: number; y: number }): void {
  editor.updateSlide(props.slide.id, (slide) => {
    slide.background.focalX = point.x;
    slide.background.focalY = point.y;
  });
}

function setStage(
  name: BreakpointName,
  key: 'stageWidth' | 'stageHeight' | 'minWidth',
  value: number,
): void {
  editor.updateDocument((draft) => {
    draft.breakpoints[name][key] = value;
  });
}
const breakpointNames: Array<{ name: BreakpointName; label: string }> = [
  { name: 'desktop', label: __('Desktop') },
  { name: 'tablet', label: __('Tablet') },
  { name: 'mobile', label: __('Mobile') },
];
</script>

<template>
  <div class="sws-props">
    <section v-if="scope !== 'slider'" class="sws-props__section">
      <h3>{{ __('Slide') }}</h3>
      <q-input
        :model-value="slide.name"
        dense
        outlined
        :label="__('Slide name')"
        :maxlength="LIMITS.nameLength"
        @change="(v: string) => editor.updateSlide(slide.id, (s) => (s.name = String(v)))"
      />
      <NumberField
        :model-value="slide.durationMs / 1000"
        :label="__('Duration')"
        suffix="s"
        :step="0.5"
        :min="LIMITS.slideDurationMinMs / 1000"
        :max="LIMITS.slideDurationMaxMs / 1000"
        @commit="(v) => editor.updateSlide(slide.id, (s) => (s.durationMs = Math.round(v * 1000)))"
      />
      <p v-if="schedule.extended" class="sws-props__warn" role="status">
        <q-icon name="r_schedule" aria-hidden="true" />
        {{
          sprintf(
            __('The animations need %s s; the slide is shown that long.'),
            (schedule.durationMs / 1000).toFixed(1),
          )
        }}
      </p>
      <q-select
        :model-value="slide.transition.type"
        :options="[
          { value: 'cut', label: __('Cut') },
          { value: 'fade', label: __('Fade') },
          { value: 'slide', label: __('Push') },
        ]"
        emit-value
        map-options
        dense
        outlined
        :label="__('Transition to this slide')"
        @update:model-value="(v) => editor.updateSlide(slide.id, (s) => (s.transition.type = v))"
      />
      <NumberField
        v-if="slide.transition.type !== 'cut'"
        :model-value="slide.transition.durationMs"
        :label="__('Transition duration')"
        suffix="ms"
        integer
        :min="0"
        :max="LIMITS.transitionMaxMs"
        @commit="(v) => editor.updateSlide(slide.id, (s) => (s.transition.durationMs = v))"
      />
      <div class="sws-props__color-row">
        <label class="sws-props__color">
          <span>{{ __('Background colour') }}</span>
          <input
            type="color"
            :value="slide.background.color ?? '#000000'"
            @change="
              (e) =>
                editor.updateSlide(
                  slide.id,
                  (s) => (s.background.color = (e.target as HTMLInputElement).value),
                )
            "
          />
        </label>
      </div>
      <div class="sws-props__color-row">
        <q-btn
          outline
          dense
          no-caps
          icon="r_wallpaper"
          :label="
            slide.background.attachmentId ? __('Replace background image') : __('Background image')
          "
          @click="chooseBackground"
        />
        <q-btn
          v-if="slide.background.attachmentId"
          flat
          dense
          no-caps
          :label="__('Remove')"
          @click="editor.updateSlide(slide.id, (s) => (s.background.attachmentId = null))"
        />
      </div>
      <FocalPointField
        v-if="backgroundUrl"
        :src="backgroundUrl"
        :x="slide.background.focalX ?? DEFAULT_FOCAL"
        :y="slide.background.focalY ?? DEFAULT_FOCAL"
        @commit="setBackgroundFocal"
      />
      <q-checkbox
        :model-value="overlayOn"
        :label="__('Overlay')"
        @update:model-value="toggleOverlay"
      />
      <div v-if="overlayOn" class="sws-props__box">
        <label class="sws-props__color">
          <span>{{ __('Overlay colour') }}</span>
          <input
            type="color"
            :value="slide.background.overlayColor ?? '#000000'"
            @change="
              (e) =>
                editor.updateSlide(
                  slide.id,
                  (s) => (s.background.overlayColor = (e.target as HTMLInputElement).value),
                )
            "
          />
        </label>
        <PercentSlider
          :model-value="
            Math.round((slide.background.overlayOpacity ?? DEFAULT_OVERLAY_OPACITY) * 100)
          "
          :label="__('Overlay opacity')"
          :min="0"
          :max="100"
          @commit="
            (v) => editor.updateSlide(slide.id, (s) => (s.background.overlayOpacity = v / 100))
          "
        />
      </div>
    </section>

    <section v-if="settings && scope !== 'slide'" class="sws-props__section">
      <h3>{{ __('Slider') }}</h3>
      <q-input
        :model-value="settings.label"
        dense
        outlined
        :label="__('Accessible name')"
        :hint="__('Announced by screen readers; the slider name is used when empty.')"
        :maxlength="LIMITS.labelLength"
        @change="(v: string) => editor.updateDocument((d) => (d.settings.label = String(v)))"
      />
      <q-btn-toggle
        :model-value="settings.layout"
        no-caps
        unelevated
        dense
        toggle-color="primary"
        :options="[
          { value: 'boxed', label: __('Boxed') },
          { value: 'full', label: __('Full width') },
        ]"
        @update:model-value="(v) => editor.updateDocument((d) => (d.settings.layout = v))"
      />
      <NumberField
        v-if="settings.layout === 'boxed'"
        :model-value="settings.maxWidth"
        :label="__('Maximum width')"
        suffix="px"
        integer
        :min="LIMITS.maxWidthMin"
        :max="LIMITS.maxWidthMax"
        @commit="(v) => editor.updateDocument((d) => (d.settings.maxWidth = v))"
      />
      <q-toggle
        :model-value="settings.autoplay"
        :label="__('Autoplay (with pause button)')"
        @update:model-value="
          (v: boolean) => editor.updateDocument((d) => (d.settings.autoplay = v))
        "
      />
      <q-toggle
        :model-value="settings.loop"
        :label="__('Loop')"
        @update:model-value="(v: boolean) => editor.updateDocument((d) => (d.settings.loop = v))"
      />
      <q-toggle
        :model-value="settings.showArrows"
        :label="__('Arrows')"
        @update:model-value="
          (v: boolean) => editor.updateDocument((d) => (d.settings.showArrows = v))
        "
      />
      <q-toggle
        :model-value="settings.showDots"
        :label="__('Dots')"
        @update:model-value="
          (v: boolean) => editor.updateDocument((d) => (d.settings.showDots = v))
        "
      />
    </section>

    <section v-if="breakpoints && scope !== 'slide'" class="sws-props__section">
      <h3>{{ __('Screen sizes (container width)') }}</h3>
      <div v-for="bp in breakpointNames" :key="bp.name" class="sws-props__grid">
        <NumberField
          :model-value="breakpoints[bp.name].minWidth"
          :label="sprintf(__('%s from'), bp.label)"
          suffix="px"
          integer
          :min="0"
          :max="LIMITS.breakpointMax"
          @commit="(v) => setStage(bp.name, 'minWidth', v)"
        />
        <div class="sws-props__grid">
          <NumberField
            :model-value="breakpoints[bp.name].stageWidth"
            :label="__('Stage width')"
            integer
            :min="LIMITS.stageMin"
            :max="LIMITS.stageMax"
            @commit="(v) => setStage(bp.name, 'stageWidth', v)"
          />
          <NumberField
            :model-value="breakpoints[bp.name].stageHeight"
            :label="__('Stage height')"
            integer
            :min="LIMITS.stageHeightMin"
            :max="LIMITS.stageHeightMax"
            @commit="(v) => setStage(bp.name, 'stageHeight', v)"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped src="./props.css"></style>
