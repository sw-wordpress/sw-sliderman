<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { sliders } from '@editor/api';
import { ApiError } from '@editor/api/client';
import type { SliderStatus, SliderSummary } from '@editor/api/sliders';
import { __, sprintf } from '@editor/i18n';
import { formatGmt } from '@editor/utils/format';
import PageHeader from '@editor/components/ui/PageHeader.vue';
import SwsCard from '@editor/components/ui/SwsCard.vue';
import EmptyState from '@editor/components/ui/EmptyState.vue';
import ErrorState from '@editor/components/ui/ErrorState.vue';
import ConfirmDialog from '@editor/components/ui/ConfirmDialog.vue';
import CopyButton from '@editor/components/ui/CopyButton.vue';

const router = useRouter();
const $q = useQuasar();

const items = ref<SliderSummary[]>([]);
const loading = ref(true);
const error = ref<ApiError | null>(null);
const search = ref('');
const createOpen = ref(false);
const createName = ref('');
const creating = ref(false);
const createError = ref<string | null>(null);
const trashTarget = ref<SliderSummary | null>(null);
const trashing = ref(false);
const duplicating = ref<number | null>(null);
let requestGeneration = 0;

const statusLabel: Record<SliderStatus, () => string> = {
  unpublished: () => __('Not published'),
  published: () => __('Published'),
  changed: () => __('Published, newer draft'),
};

async function load(): Promise<void> {
  const generation = ++requestGeneration;
  loading.value = true;
  error.value = null;
  try {
    const result = await sliders.list(search.value.trim());
    // A late response of an older search must not replace the current one.
    if (generation === requestGeneration) items.value = result;
  } catch (e) {
    if (generation === requestGeneration)
      error.value = e instanceof ApiError ? e : new ApiError('sws_unknown', String(e), 0);
  } finally {
    if (generation === requestGeneration) loading.value = false;
  }
}

let searchTimer: number | null = null;
watch(search, () => {
  if (searchTimer !== null) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => void load(), 300);
});

onMounted(load);

const canCreate = computed(
  () => createName.value.trim().length > 0 && createName.value.trim().length <= 200,
);

async function create(): Promise<void> {
  if (!canCreate.value || creating.value) return;
  creating.value = true;
  createError.value = null;
  try {
    const created = await sliders.create(createName.value.trim());
    createOpen.value = false;
    createName.value = '';
    await router.push(`/sliders/${created.id}`);
  } catch (e) {
    createError.value = e instanceof ApiError ? e.message : String(e);
  } finally {
    creating.value = false;
  }
}

async function duplicate(item: SliderSummary): Promise<void> {
  if (duplicating.value !== null) return;
  duplicating.value = item.id;
  try {
    const copy = await sliders.duplicate(
      item.id,
      sprintf(__('%s (copy)'), item.title).slice(0, 200),
    );
    await router.push(`/sliders/${copy.id}`);
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: error instanceof ApiError ? error.message : String(error),
    });
  } finally {
    duplicating.value = null;
  }
}

async function trash(): Promise<void> {
  const target = trashTarget.value;
  if (!target) return;
  trashing.value = true;
  try {
    await sliders.trash(target.id);
    items.value = items.value.filter((item) => item.id !== target.id);
    $q.notify({
      type: 'positive',
      message: sprintf(__('“%s” was moved to the trash.'), target.title),
    });
    trashTarget.value = null;
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof ApiError ? e.message : String(e) });
  } finally {
    trashing.value = false;
  }
}
</script>

<template>
  <div class="sws-list">
    <PageHeader
      :title="__('Sliders')"
      :subtitle="
        __('Create responsive sliders and hero sections. Visitors only see published versions.')
      "
    >
      <q-btn
        unelevated
        no-caps
        color="primary"
        icon="r_add"
        :label="__('New slider')"
        @click="createOpen = true"
      />
    </PageHeader>

    <SwsCard :padding="false">
      <template #header>
        <q-input
          v-model="search"
          outlined
          dense
          clearable
          class="sws-list__search"
          :label="__('Search sliders')"
          maxlength="100"
        >
          <template #prepend><q-icon name="r_search" aria-hidden="true" /></template>
        </q-input>
      </template>

      <div v-if="loading && items.length === 0" class="sws-list__loading" aria-busy="true">
        <q-skeleton v-for="n in 3" :key="n" type="rect" height="48px" />
      </div>
      <ErrorState v-else-if="error" :error="error" compact @retry="load" />
      <EmptyState
        v-else-if="items.length === 0"
        :illustration="search ? 'search' : 'sliders'"
        :title="search ? __('No sliders found') : __('No sliders yet')"
        :text="
          search
            ? __('Try a different search term.')
            : __('Create your first slider to get started.')
        "
        compact
      >
        <q-btn
          v-if="!search"
          unelevated
          no-caps
          color="primary"
          icon="r_add"
          :label="__('New slider')"
          @click="createOpen = true"
        />
      </EmptyState>
      <table v-else class="sws-table">
        <thead>
          <tr>
            <th scope="col">{{ __('Name') }}</th>
            <th scope="col">{{ __('Status') }}</th>
            <th scope="col">{{ __('Embed code') }}</th>
            <th scope="col">{{ __('Last change') }}</th>
            <th scope="col">
              <span class="sws-sr-only">{{ __('Actions') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td :data-label="__('Name')">
              <router-link :to="`/sliders/${item.id}`" class="sws-list__name">{{
                item.title
              }}</router-link>
            </td>
            <td :data-label="__('Status')">
              <span class="sws-badge" :class="`sws-badge--${item.status}`">{{
                statusLabel[item.status]()
              }}</span>
            </td>
            <td :data-label="__('Embed code')">
              <span class="sws-list__code">
                <code>{{ item.shortcode }}</code>
                <CopyButton :value="item.shortcode" :label="__('Copy embed code')" />
              </span>
            </td>
            <td :data-label="__('Last change')" class="sws-num">
              {{ formatGmt(item.modifiedGmt) }}
            </td>
            <td data-label="" class="sws-list__actions">
              <q-btn
                flat
                dense
                no-caps
                icon="r_edit"
                :label="__('Edit')"
                :to="`/sliders/${item.id}`"
              />
              <q-btn
                flat
                dense
                round
                icon="r_content_copy"
                :aria-label="__('Duplicate')"
                :loading="duplicating === item.id"
                :disable="duplicating !== null"
                @click="duplicate(item)"
                ><q-tooltip>{{ __('Duplicate') }}</q-tooltip></q-btn
              >
              <q-btn
                flat
                dense
                round
                icon="r_delete"
                :aria-label="sprintf(__('Move “%s” to the trash'), item.title)"
                @click="trashTarget = item"
              >
                <q-tooltip>{{ __('Move to trash') }}</q-tooltip>
              </q-btn>
            </td>
          </tr>
        </tbody>
      </table>
    </SwsCard>

    <q-dialog v-model="createOpen" @hide="createError = null">
      <q-card class="sws-dialog">
        <form @submit.prevent="create">
          <q-card-section>
            <h2 class="sws-dialog__title">{{ __('New slider') }}</h2>
            <p class="sws-muted">
              {{ __('The slider starts with one empty slide. You can change the name later.') }}
            </p>
          </q-card-section>
          <q-card-section>
            <q-input v-model="createName" outlined autofocus maxlength="200" :label="__('Name')" />
            <p v-if="createError" class="sws-form-error" role="alert">{{ createError }}</p>
          </q-card-section>
          <q-card-actions align="right">
            <q-btn flat no-caps :label="__('Cancel')" @click="createOpen = false" />
            <q-btn
              unelevated
              no-caps
              color="primary"
              type="submit"
              :label="__('Create and edit')"
              :loading="creating"
              :disable="!canCreate"
            />
          </q-card-actions>
        </form>
      </q-card>
    </q-dialog>

    <ConfirmDialog
      :model-value="trashTarget !== null"
      :title="__('Move slider to the trash?')"
      :target="trashTarget?.title"
      :consequences="[
        __('Pages that embed it will no longer show the slider.'),
        __('Revisions and fonts are kept.'),
      ]"
      :confirm-label="__('Move to trash')"
      :loading="trashing"
      @update:model-value="
        (open: boolean) => {
          if (!open) trashTarget = null;
        }
      "
      @confirm="trash"
    />
  </div>
</template>

<style scoped>
.sws-list__search {
  width: min(360px, 100%);
}
.sws-list__loading {
  display: grid;
  gap: 8px;
  padding: 16px 22px 22px;
}
.sws-list__name {
  font-weight: 650;
}
.sws-list__code {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.sws-list__actions {
  text-align: right;
  white-space: nowrap;
}
.sws-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}
.sws-badge--published {
  background: var(--sws-success-bg);
  color: var(--sws-success-text);
}
.sws-badge--changed {
  background: var(--sws-warning-bg);
  color: var(--sws-warning-text);
}
.sws-badge--unpublished {
  background: var(--sws-neutral-bg);
  color: var(--sws-neutral-text);
}
</style>
