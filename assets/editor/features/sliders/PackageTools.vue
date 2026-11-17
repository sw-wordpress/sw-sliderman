<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { fonts as fontsApi, packages } from '@editor/api';
import {
  parsePreview,
  type ImportJob,
  type LocalTemplate,
  type PackagePreview,
} from '@editor/api/packages';
import { LIMITS } from '@shared/limits';
import { ApiError } from '@editor/api/client';
import { can, getConfig } from '@editor/config';
import { __, sprintf } from '@editor/i18n';
import { pickImage } from '@editor/composables/useMediaPicker';
import type { FontInstallation } from '@editor/api/fonts';
import SwsCard from '@editor/components/ui/SwsCard.vue';

const router = useRouter();
const allowed = computed(() => can('sws_import_sliders') && can('sws_manage_fonts'));
const installedFonts = ref<FontInstallation[]>([]);
const mediaNames = ref<Record<string, string>>({});
const templates = ref<LocalTemplate[]>([]);
const template = ref<string | null>(null);
const file = ref<File | null>(null);
const preview = ref<PackagePreview | null>(null);
const media = ref<Record<string, number>>({});
const fonts = ref<Record<string, string>>({});
const busy = ref(false);
const importing = ref(false);
const progress = ref<ImportJob | null>(null);
const recoveryKey = `sws-package-preview:${getConfig().restRoot}:${getConfig().siteId}:${getConfig().userId}`;
let progressTimer: number | null = null;
onUnmounted(() => {
  if (progressTimer !== null) window.clearInterval(progressTimer);
});
const error = ref('');
const ready = computed(() => {
  const value = preview.value;
  return (
    value !== null &&
    value.media.every((item) => item.file !== null || Number.isSafeInteger(media.value[item.id])) &&
    (value.complete || value.fonts.every((item) => (fonts.value[item.id] ?? '').trim() !== ''))
  );
});

onMounted(async () => {
  if (!allowed.value) return;
  try {
    templates.value = await packages.templates();
    installedFonts.value = await fontsApi.installations();
    const recovery = sessionStorage.getItem(recoveryKey);
    if (recovery) {
      preview.value = parsePreview(JSON.parse(recovery));
      progress.value = await packages.status(preview.value.token);
    }
  } catch (cause) {
    if (cause instanceof SyntaxError || expired(cause)) {
      preview.value = null;
      sessionStorage.removeItem(recoveryKey);
    }
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
});

function expired(cause: unknown): boolean {
  return (
    cause instanceof ApiError &&
    (cause.code === 'sws_package_session' || cause.code === 'sws_package_staging')
  );
}

async function run(action: () => Promise<void>): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await action();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}
async function inspect(): Promise<void> {
  if (!file.value) return;
  await run(async () => {
    if (preview.value) {
      try {
        const completed = await packages.cancel(preview.value.token);
        if (typeof completed === 'number') await router.push(`/sliders/${completed}`);
      } catch (cause) {
        if (!expired(cause)) throw cause;
      }
    }
    preview.value = null;
    media.value = {};
    mediaNames.value = {};
    fonts.value = {};
    if (file.value) {
      preview.value = await packages.preview(file.value);
      sessionStorage.setItem(recoveryKey, JSON.stringify(preview.value));
    }
  });
}
async function assignImage(sourceId: number): Promise<void> {
  const image = await pickImage();
  if (image) {
    media.value[sourceId] = image.id;
    mediaNames.value[sourceId] = image.alt || String(image.id);
  }
}
async function commit(): Promise<void> {
  if (!preview.value || !ready.value) return;
  await run(async () => {
    const value = preview.value;
    if (!value) return;
    importing.value = true;
    progressTimer = window.setInterval(() => {
      void packages
        .status(value.token)
        .then((job) => {
          progress.value = job;
        })
        .catch(() => {});
    }, 1000);
    try {
      const id = await packages.commit(value.token, media.value, fonts.value);
      sessionStorage.removeItem(recoveryKey);
      preview.value = null;
      await router.push(`/sliders/${id}`);
    } finally {
      if (progressTimer !== null) window.clearInterval(progressTimer);
      progressTimer = null;
      importing.value = false;
    }
  });
}
async function checkStatus(): Promise<void> {
  if (!preview.value) return;
  await run(async () => {
    if (!preview.value) return;
    const job = await packages.status(preview.value.token);
    progress.value = job;
    if (job.state === 'queued') {
      const id = await packages.commit(preview.value.token, {}, {});
      sessionStorage.removeItem(recoveryKey);
      preview.value = null;
      await router.push(`/sliders/${id}`);
      return;
    }
    if (job.state === 'completed' && job.id !== null) {
      sessionStorage.removeItem(recoveryKey);
      preview.value = null;
      await router.push(`/sliders/${job.id}`);
    }
  });
}
async function cancel(): Promise<void> {
  if (importing.value && preview.value) {
    try {
      const completed = await packages.cancel(preview.value.token);
      if (typeof completed === 'number') await router.push(`/sliders/${completed}`);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    }
    return;
  }
  await run(async () => {
    if (preview.value) {
      try {
        const completed = await packages.cancel(preview.value.token);
        if (typeof completed === 'number') await router.push(`/sliders/${completed}`);
      } catch (cause) {
        if (!expired(cause)) throw cause;
      }
    }
    preview.value = null;
    file.value = null;
    progress.value = null;
    sessionStorage.removeItem(recoveryKey);
  });
}
async function createTemplate(): Promise<void> {
  if (!template.value) return;
  await run(async () => {
    if (template.value)
      await router.push(`/sliders/${await packages.fromTemplate(template.value)}`);
  });
}
</script>

<template>
  <SwsCard
    v-if="allowed"
    class="q-mb-lg"
    :title="__('Templates and packages')"
    :subtitle="
      __('Imports create a new unpublished slider. No resources are downloaded from the network.')
    "
    icon="r_inventory_2"
  >
    <div class="row q-gutter-md items-center">
      <q-select
        v-model="template"
        dense
        :options="templates"
        option-value="id"
        option-label="name"
        emit-value
        map-options
        outlined
        :label="__('Local template')"
        :disable="busy"
        style="min-width: 220px"
      />
      <q-btn
        no-caps
        :label="__('Create from template')"
        :disable="!template || busy"
        @click="createTemplate"
      />
      <q-file
        v-model="file"
        style="min-width: 220px"
        dense
        outlined
        accept=".zip,application/zip"
        :label="__('Slider ZIP archive')"
        :disable="busy || preview !== null"
        :max-file-size="LIMITS.archiveBytes"
      />
      <q-btn
        no-caps
        :label="__('Check package')"
        :disable="!file || busy || preview !== null"
        @click="inspect"
      />
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="preview" class="q-mt-md">
      <h3 class="sws-package-preview__title">{{ preview.title }}</h3>
      <p v-if="progress?.message" role="alert">{{ progress.message }}</p>
      <p v-if="progress && progress.total > 0" role="status">
        {{
          sprintf(
            __('Import progress: %s of %s steps.'),
            String(progress.done),
            String(progress.total),
          )
        }}
      </p>
      <q-btn
        v-if="!importing"
        no-caps
        :label="__('Check import status')"
        :disable="busy"
        @click="checkStatus"
      />
      <p v-if="preview.conflicts.length" role="status">
        {{ __('Existing resource IDs refer to different content. New IDs will be assigned:') }}
        {{ preview.conflicts.join(', ') }}
      </p>
      <p>
        {{
          preview.complete
            ? __('Complete package with local resources.')
            : __('Incomplete package: assign missing resources before importing.')
        }}
      </p>
      <p>
        {{
          sprintf(
            __(
              '%s images, %s font installations. Identical verified resources are reused; source identities are remapped.',
            ),
            String(preview.media.length),
            String(preview.fonts.length),
          )
        }}
      </p>
      <div
        v-for="item in preview.media.filter((entry) => entry.file === null)"
        :key="item.id"
        class="q-mb-md"
      >
        <q-btn
          no-caps
          :label="sprintf(__('Choose replacement for image %s'), item.alt || String(item.id))"
          :disable="busy"
          @click="assignImage(item.id)"
        />
        <span v-if="mediaNames[item.id]">{{ mediaNames[item.id] }}</span>
      </div>
      <div v-if="!preview.complete">
        <q-select
          v-for="font in preview.fonts"
          :key="font.id"
          v-model="fonts[font.id]"
          :options="installedFonts.filter((item) => item.filesPresent && !item.originMismatch)"
          option-value="id"
          option-label="family"
          emit-value
          map-options
          outlined
          :label="sprintf(__('Local replacement font for %s'), font.family)"
          :disable="busy"
          class="q-mb-md"
        />
      </div>
      <q-btn
        no-caps
        color="primary"
        :label="__('Import as new draft')"
        :disable="!ready || busy"
        :loading="busy"
        @click="commit"
      />
      <q-btn no-caps :label="__('Cancel import')" :disable="busy" @click="cancel" />
    </div>
  </SwsCard>
</template>

<style scoped>
.sws-package-preview__title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.4;
}
</style>
