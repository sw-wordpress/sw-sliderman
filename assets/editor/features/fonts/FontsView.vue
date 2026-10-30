<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import { fonts as fontsApi } from '@editor/api';
import { ApiError } from '@editor/api/client';
import type {
  CatalogFamily,
  FontCatalogResponse,
  FontInstallation,
  FontVariant,
  FontJob,
  ManualFont,
} from '@editor/api/fonts';
import { useInstalledFonts } from '@editor/composables/useInstalledFonts';
import { can } from '@editor/config';
import { __, sprintf } from '@editor/i18n';
import { formatGmt } from '@editor/utils/format';
import PageHeader from '@editor/components/ui/PageHeader.vue';
import SwsCard from '@editor/components/ui/SwsCard.vue';
import EmptyState from '@editor/components/ui/EmptyState.vue';
import ErrorState from '@editor/components/ui/ErrorState.vue';
import ConfirmDialog from '@editor/components/ui/ConfirmDialog.vue';

/**
 * Local Google Fonts management (PLAN.md 8). Only installed fonts are previewed, from their local
 * files; catalog families are listed with metadata in the system font. Installing is an explicit
 * administrative action that makes the SERVER download the files.
 */
const SAMPLE = 'ÄÖÜäöüß € – „Sphinx of black quartz, judge my vow.“';
const $q = useQuasar();
const { installations, refresh } = useInstalledFonts();
const manage = can('sws_manage_fonts');

const catalog = ref<FontCatalogResponse | null>(null);
const error = ref<ApiError | null>(null);
const search = ref('');
const installedOnly = ref(false);
const jobs = ref<FontJob[]>([]);
const changingOffline = ref(false);
const importOpen = ref(false);
const importFile = ref<File | null>(null);
const importing = ref(false);
const importError = ref('');
const manual = ref<ManualFont>({
  family: '',
  weight: 400,
  style: 'normal',
  subset: 'latin',
  licenseId: 'OFL-1.1',
  licenseText: '',
});
let mounted = true;
let pollTimer: number | null = null;
const runningRequests = new Set<string>();
onBeforeUnmount(() => {
  mounted = false;
  if (pollTimer !== null) window.clearTimeout(pollTimer);
});
const selected = ref<CatalogFamily | null>(null);
const chosenVariants = ref<string[]>([]);
const chosenSubsets = ref<string[]>([]);
const installing = ref(false);
const installError = ref<string | null>(null);
const removeTarget = ref<FontInstallation | null>(null);
const removing = ref(false);
const removeError = ref<string | null>(null);

async function load(): Promise<void> {
  error.value = null;
  try {
    const [result] = await Promise.all([fontsApi.catalog(), refresh()]);
    if (!mounted) return;
    catalog.value = result;
    if (manage) await pollJobs();
  } catch (e) {
    error.value = e instanceof ApiError ? e : new ApiError('sws_unknown', String(e), 0);
  }
}
onMounted(load);

const families = computed(() => {
  const term = search.value.trim().toLowerCase();
  return (catalog.value?.families ?? [])
    .filter((family) => term === '' || family.family.toLowerCase().includes(term))
    .filter((family) => !installedOnly.value || family.installed);
});

function variantKey(variant: FontVariant): string {
  return `${variant.weight}|${variant.style}`;
}
function variantLabel(variant: FontVariant): string {
  return variant.style === 'italic'
    ? sprintf(__('%d italic'), variant.weight)
    : String(variant.weight);
}

function openInstall(family: CatalogFamily): void {
  selected.value = family;
  installError.value = null;
  const defaults = family.variants.filter(
    (v) => (v.weight === 400 || v.weight === 700) && v.style === 'normal',
  );
  chosenVariants.value = (defaults.length > 0 ? defaults : family.variants.slice(0, 1)).map(
    variantKey,
  );
  chosenSubsets.value = family.subsets.filter((s) => s === 'latin' || s === 'latin-ext');
}

async function install(): Promise<void> {
  const family = selected.value;
  if (!family || chosenVariants.value.length === 0 || chosenSubsets.value.length === 0) return;
  installing.value = true;
  installError.value = null;
  try {
    const variants = family.variants.filter((v) => chosenVariants.value.includes(variantKey(v)));
    await fontsApi.createJob('install', {
      familyId: family.id,
      variants,
      subsets: chosenSubsets.value,
    });
    selected.value = null;
    await pollJobs();
  } catch (e) {
    // A timeout does not prove failure: reload the list before offering a retry.
    if (e instanceof ApiError && e.code === 'sws_timeout') await load();
    installError.value = e instanceof ApiError ? e.message : String(e);
  } finally {
    installing.value = false;
  }
}

async function remove(): Promise<void> {
  const target = removeTarget.value;
  if (!target) return;
  removing.value = true;
  removeError.value = null;
  try {
    await fontsApi.uninstall(target.id);
    removeTarget.value = null;
    await load();
  } catch (e) {
    removeError.value = e instanceof ApiError ? e.message : String(e);
  } finally {
    removing.value = false;
  }
}

const stateLabel = (state: FontJob['state']): string =>
  ({
    queued: __('Queued'),
    running: __('Installing'),
    completed: __('Completed'),
    failed: __('Failed'),
    cancelled: __('Cancelled'),
  })[state];
async function pollJobs(): Promise<void> {
  if (!mounted || !manage) return;
  if (pollTimer !== null) window.clearTimeout(pollTimer);
  const previous = jobs.value;
  const result = await fontsApi.jobs();
  if (!mounted) return;
  jobs.value = result;
  const completed = result.some(
    (item) =>
      item.state === 'completed' &&
      previous.some((old) => old.id === item.id && old.state !== 'completed'),
  );
  if (completed) {
    const [data] = await Promise.all([fontsApi.catalog(), refresh()]);
    if (mounted) catalog.value = data;
  }
  for (const item of result.filter((job) => job.state === 'queued')) startRunner(item.id);
  if (result.some((job) => job.state === 'queued' || job.state === 'running')) {
    pollTimer = window.setTimeout(() => {
      void pollJobs().catch((e: unknown) => {
        if (mounted)
          error.value = e instanceof ApiError ? e : new ApiError('sws_unknown', String(e), 0);
      });
    }, 1500);
  }
}
function startRunner(id: string): void {
  if (runningRequests.has(id)) return;
  runningRequests.add(id);
  // Same leased runner as WP-Cron. This explicit installation remains usable when WP-Cron is disabled.
  void fontsApi
    .runJob(id)
    .catch((e: unknown) => {
      if (mounted)
        $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
    })
    .finally(() => {
      runningRequests.delete(id);
      if (mounted) void pollJobs().catch(() => {});
    });
}
async function refreshCatalog(): Promise<void> {
  try {
    await fontsApi.createJob('catalog');
    await pollJobs();
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
  }
}
async function changeOffline(value: boolean): Promise<void> {
  changingOffline.value = true;
  try {
    await fontsApi.setOffline(value);
    await load();
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
  } finally {
    changingOffline.value = false;
  }
}
async function jobAction(item: FontJob, action: 'retry' | 'cancel'): Promise<void> {
  try {
    if (action === 'retry') await fontsApi.retryJob(item.id);
    else await fontsApi.cancelJob(item.id);
    await pollJobs();
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
  }
}
function updateInstallation(installation: FontInstallation): void {
  const item = catalog.value?.families.find((family) => family.id === installation.familyId);
  if (!item) return;
  openInstall(item);
  chosenVariants.value = item.variants
    .filter((v) => installation.variants.some((old) => variantKey(old) === variantKey(v)))
    .map(variantKey);
  chosenSubsets.value = [...new Set(installation.variants.flatMap((v) => v.subsets))].filter(
    (subset) => item.subsets.includes(subset),
  );
}
async function importLocal(): Promise<void> {
  const file = importFile.value;
  if (!file || file.size > 2097152) {
    importError.value = __('Choose a WOFF2 file up to 2 MiB.');
    return;
  }
  importing.value = true;
  importError.value = '';
  try {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(new Error(__('The file could not be read.')));
      reader.readAsDataURL(file);
    });
    await fontsApi.importFile(manual.value, base64);
    importOpen.value = false;
    importFile.value = null;
    await load();
    $q.notify({ type: 'positive', message: __('The font was imported locally.') });
  } catch (e) {
    importError.value = e instanceof Error ? e.message : String(e);
  } finally {
    importing.value = false;
  }
}

function family(installation: FontInstallation): string {
  return `'sws-${installation.id}', system-ui, sans-serif`;
}
</script>

<template>
  <div class="sws-fonts">
    <PageHeader
      :title="__('Fonts')"
      :subtitle="
        __(
          'Google Fonts are downloaded once by your server and then served from this site only. Visitors and the editor never contact Google.',
        )
      "
    >
      <q-btn
        v-if="manage"
        outline
        no-caps
        icon="r_upload_file"
        :label="__('Import WOFF2')"
        @click="importOpen = true"
      />
    </PageHeader>

    <ErrorState v-if="error" :error="error" @retry="load" />
    <template v-else>
      <SwsCard v-if="manage" :title="__('Font downloads')" icon="r_cloud_download">
        <q-toggle
          :model-value="catalog?.offline ?? false"
          :disable="changingOffline"
          :label="__('Offline mode')"
          @update:model-value="changeOffline"
        />
        <p class="sws-muted">
          {{
            __(
              'Offline mode blocks new server downloads. Local imports and installed fonts remain available.',
            )
          }}
        </p>
        <q-list v-if="jobs.length" separator>
          <q-item v-for="item in jobs.slice(0, 20)" :key="item.id">
            <q-item-section
              ><q-item-label
                >{{ item.kind === 'catalog' ? __('Catalog update') : item.familyId }} ·
                {{ stateLabel(item.state) }}</q-item-label
              ><q-item-label v-if="item.error" caption class="text-negative">{{
                item.error
              }}</q-item-label></q-item-section
            >
            <q-item-section side>
              <q-btn
                v-if="item.state === 'queued' || item.state === 'running'"
                flat
                dense
                no-caps
                :label="__('Cancel')"
                @click="jobAction(item, 'cancel')"
              />
              <q-btn
                v-if="item.state === 'running'"
                flat
                dense
                no-caps
                :label="__('Continue processing')"
                @click="startRunner(item.id)"
              />
              <q-btn
                v-if="item.state === 'failed' || item.state === 'cancelled'"
                flat
                dense
                no-caps
                :label="__('Retry')"
                :disable="catalog?.offline"
                @click="jobAction(item, 'retry')"
              />
            </q-item-section>
          </q-item>
        </q-list>
      </SwsCard>
      <SwsCard :title="__('Installed fonts')" icon="r_download_done">
        <EmptyState
          v-if="installations.length === 0"
          illustration="fonts"
          compact
          :title="__('No fonts installed yet')"
          :text="__('Install a family from the catalog below.')"
        />
        <ul v-else class="sws-fonts__installed">
          <li v-for="installation in installations" :key="installation.id" class="sws-fonts__item">
            <div class="sws-fonts__head">
              <strong>{{ installation.family }}</strong>
              <span class="sws-muted">{{
                installation.variants.map(variantLabel).join(', ')
              }}</span>
              <span
                v-if="installation.originMismatch"
                class="sws-fonts__badge sws-fonts__badge--danger"
                >{{ __('Upload origin differs: local font loading is disabled.') }}</span
              >
              <span
                v-if="!installation.filesPresent"
                class="sws-fonts__badge sws-fonts__badge--danger"
                >{{ __('Files missing') }}</span
              >
              <span v-if="installation.inUse" class="sws-fonts__badge">{{ __('In use') }}</span>
            </div>
            <p
              v-for="variant in installation.variants"
              :key="variantKey(variant)"
              class="sws-fonts__sample"
              :style="{
                fontFamily: family(installation),
                fontWeight: variant.weight,
                fontStyle: variant.style,
              }"
            >
              {{ SAMPLE }}
            </p>
            <div class="sws-fonts__meta">
              <span>{{ sprintf(__('License: %s'), installation.licenseId) }}</span>
              <a
                v-if="installation.licenseUrl"
                :href="installation.licenseUrl"
                target="_blank"
                rel="noopener"
                >{{ __('License text') }}</a
              >
              <span>{{ sprintf(__('Installed %s'), formatGmt(installation.installedGmt)) }}</span>
              <code>{{ installation.id }}</code>
              <q-btn
                v-if="manage && catalog?.families.some((item) => item.id === installation.familyId)"
                flat
                dense
                no-caps
                :label="__('Update or repair')"
                :disable="catalog?.offline"
                @click="updateInstallation(installation)"
              />
              <q-btn
                v-if="manage"
                flat
                dense
                no-caps
                color="negative"
                icon="r_delete"
                :label="__('Remove')"
                :disable="installation.inUse"
                @click="((removeTarget = installation), (removeError = null))"
              >
                <q-tooltip v-if="installation.inUse">{{
                  __('Used by a slider, revision or published version')
                }}</q-tooltip>
              </q-btn>
            </div>
          </li>
        </ul>
      </SwsCard>

      <SwsCard
        :title="__('Catalog')"
        icon="r_menu_book"
        :subtitle="
          catalog ? sprintf(__('Local metadata, version %s'), catalog.catalogVersion) : undefined
        "
      >
        <template #actions>
          <q-checkbox v-model="installedOnly" dense :label="__('Installed families only')" />
          <q-btn
            v-if="manage"
            flat
            dense
            no-caps
            icon="r_refresh"
            :label="__('Update catalog')"
            :disable="
              catalog?.offline ||
              jobs.some(
                (item) =>
                  item.kind === 'catalog' && (item.state === 'queued' || item.state === 'running'),
              )
            "
            @click="refreshCatalog"
          />
          <q-input
            v-model="search"
            outlined
            dense
            clearable
            :label="__('Search family')"
            class="sws-fonts__search"
          />
        </template>
        <p v-if="catalog?.offline" class="sws-fonts__offline" role="status">
          <q-icon name="r_cloud_off" aria-hidden="true" />
          {{
            __(
              'Offline mode is active: no font downloads are possible. Installed fonts keep working.',
            )
          }}
        </p>
        <table class="sws-table">
          <thead>
            <tr>
              <th scope="col">{{ __('Family') }}</th>
              <th scope="col">{{ __('Category') }}</th>
              <th scope="col">{{ __('Styles') }}</th>
              <th scope="col">{{ __('License') }}</th>
              <th scope="col">
                <span class="sws-sr-only">{{ __('Actions') }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in families" :key="item.id">
              <td :data-label="__('Family')">
                <strong>{{ item.family }}</strong>
              </td>
              <td :data-label="__('Category')">{{ item.category }}</td>
              <td :data-label="__('Styles')">
                {{ item.static ? item.variants.length : __('variable') }}
              </td>
              <td :data-label="__('License')">{{ item.license }}</td>
              <td data-label="" class="sws-fonts__actions">
                <span v-if="!item.static" class="sws-fonts__badge">{{
                  __('Variable font – not supported yet')
                }}</span>
                <q-btn
                  v-else-if="manage"
                  flat
                  dense
                  no-caps
                  icon="r_download"
                  :label="item.installed ? __('Install more styles') : __('Install')"
                  :disable="catalog?.offline"
                  @click="openInstall(item)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </SwsCard>
    </template>

    <q-dialog
      :model-value="selected !== null"
      @update:model-value="
        (open: boolean) => {
          if (!open && !installing) selected = null;
        }
      "
    >
      <q-card v-if="selected" class="sws-dialog">
        <q-card-section>
          <h2 class="sws-dialog__title">{{ sprintf(__('Install %s'), selected.family) }}</h2>
          <p class="sws-muted">
            {{
              __(
                'Only the selected styles and character sets are downloaded. Missing weights are never synthesised.',
              )
            }}
            {{
              __(
                'Existing sliders keep their pinned font version until it is changed in the editor.',
              )
            }}
          </p>
        </q-card-section>
        <q-card-section class="sws-fonts__choices">
          <fieldset>
            <legend>{{ __('Styles') }}</legend>
            <q-checkbox
              v-for="variant in selected.variants"
              :key="variantKey(variant)"
              v-model="chosenVariants"
              :val="variantKey(variant)"
              :label="variantLabel(variant)"
              dense
            />
          </fieldset>
          <fieldset>
            <legend>{{ __('Character sets') }}</legend>
            <q-checkbox
              v-for="subset in selected.subsets"
              :key="subset"
              v-model="chosenSubsets"
              :val="subset"
              :label="subset"
              dense
            />
          </fieldset>
          <p v-if="installError" class="sws-form-error" role="alert">{{ installError }}</p>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            flat
            no-caps
            :label="__('Cancel')"
            :disable="installing"
            @click="selected = null"
          />
          <q-btn
            unelevated
            no-caps
            color="primary"
            icon="r_download"
            :label="__('Install locally')"
            :loading="installing"
            :disable="chosenVariants.length === 0 || chosenSubsets.length === 0"
            @click="install"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="importOpen" :persistent="importing">
      <q-card class="sws-dialog">
        <q-card-section
          ><h2 class="sws-dialog__title">{{ __('Import WOFF2') }}</h2>
          <p class="sws-muted">
            {{
              __(
                'Import a static font with its license text. Check its character coverage in the local preview.',
              )
            }}
          </p></q-card-section
        >
        <q-card-section class="sws-fonts__choices">
          <q-file
            v-model="importFile"
            outlined
            dense
            accept=".woff2"
            :max-file-size="2097152"
            :label="__('WOFF2 file (up to 2 MiB)')"
          />
          <q-input v-model="manual.family" outlined dense maxlength="80" :label="__('Family')" />
          <div class="row q-col-gutter-sm">
            <q-select
              v-model="manual.weight"
              class="col"
              outlined
              dense
              :options="[100, 200, 300, 400, 500, 600, 700, 800, 900]"
              :label="__('Weight')"
            />
            <q-select
              v-model="manual.style"
              class="col"
              outlined
              dense
              :options="[
                { value: 'normal', label: __('Normal') },
                { value: 'italic', label: __('italic') },
              ]"
              emit-value
              map-options
              :label="__('Style')"
            />
          </div>
          <q-select
            v-model="manual.subset"
            outlined
            dense
            :options="['latin', 'latin-ext', 'cyrillic', 'greek']"
            :label="__('Character sets')"
          />
          <q-input
            v-model="manual.licenseId"
            outlined
            dense
            maxlength="40"
            :label="__('License identifier')"
          />
          <q-input
            v-model="manual.licenseText"
            outlined
            dense
            type="textarea"
            maxlength="131072"
            :label="__('License text')"
          />
          <p v-if="importError" role="alert" class="sws-form-error">{{ importError }}</p>
        </q-card-section>
        <q-card-actions align="right"
          ><q-btn v-close-popup flat no-caps :label="__('Cancel')" :disable="importing" /><q-btn
            unelevated
            no-caps
            color="primary"
            :label="__('Import locally')"
            :loading="importing"
            :disable="!importFile || !manual.family.trim() || !manual.licenseText.trim()"
            @click="importLocal"
        /></q-card-actions>
      </q-card>
    </q-dialog>

    <ConfirmDialog
      :model-value="removeTarget !== null"
      :title="__('Remove this font installation?')"
      :target="removeTarget?.family"
      :consequences="[
        __('The local font files are deleted.'),
        __('Only possible while no slider, revision or published version uses it.'),
      ]"
      :confirm-label="__('Remove')"
      :loading="removing"
      :error="removeError"
      @update:model-value="
        (open: boolean) => {
          if (!open) removeTarget = null;
        }
      "
      @confirm="remove"
    />
  </div>
</template>

<style scoped>
.sws-fonts {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sws-fonts__installed {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sws-fonts__item {
  padding-bottom: 16px;
  border-bottom: 1px solid var(--sws-border);
}
.sws-fonts__item:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}
.sws-fonts__head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: baseline;
}
.sws-fonts__sample {
  font-synthesis: none;
  margin-top: 6px;
  font-size: 24px;
  line-height: 1.3;
}
.sws-fonts__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  align-items: center;
  margin-top: 8px;
  font-size: 13px;
  color: var(--sws-muted);
}
.sws-fonts__badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--sws-neutral-bg);
  color: var(--sws-neutral-text);
  font-size: 12px;
  font-weight: 600;
}
.sws-fonts__badge--danger {
  background: var(--sws-danger-bg);
  color: var(--sws-danger-text);
}
.sws-fonts__search {
  width: min(260px, 100%);
}
.sws-fonts__actions {
  text-align: right;
}
.sws-fonts__offline {
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--sws-info-bg);
  color: var(--sws-info-text);
}
.sws-fonts__choices {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sws-fonts__choices fieldset {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0;
  padding: 8px 12px 12px;
  border: 1px solid var(--sws-border);
  border-radius: 10px;
}
.sws-fonts__choices legend {
  padding: 0 4px;
  font-size: 13px;
  font-weight: 650;
}
</style>
