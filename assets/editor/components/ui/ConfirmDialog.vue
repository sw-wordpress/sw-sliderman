<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { __, sprintf } from '@editor/i18n';
import { uid } from '@editor/utils/ids';

const open = defineModel<boolean>({ required: true });
const props = withDefaults(
  defineProps<{
    title: string;
    message?: string | undefined;
    /** Name of the object that is acted upon (shown prominently). */
    target?: string | undefined;
    consequences?: string[];
    confirmLabel: string;
    danger?: boolean;
    loading?: boolean;
    /** If set, the user must type exactly this text to enable the confirm button. */
    requireText?: string | undefined;
    checkboxLabel?: string | undefined;
    /** Server error to show inside the dialog (e.g. 409 target in use). */
    error?: string | null;
  }>(),
  {
    message: undefined,
    target: undefined,
    consequences: () => [],
    danger: true,
    loading: false,
    requireText: undefined,
    checkboxLabel: undefined,
    error: null,
  },
);
const emit = defineEmits<{ (e: 'confirm'): void }>();

const typed = ref('');
const checked = ref(false);
const titleId = uid('sws-cd');
const ready = computed(
  () =>
    (props.requireText === undefined || typed.value.trim() === props.requireText) &&
    (props.checkboxLabel === undefined || checked.value),
);

watch(open, (value) => {
  if (value) {
    typed.value = '';
    checked.value = false;
  }
});
</script>

<template>
  <q-dialog v-model="open" persistent :aria-labelledby="titleId" @keyup.esc="open = false">
    <q-card class="sws-cd" role="alertdialog" :aria-labelledby="titleId">
      <q-card-section class="sws-cd__head">
        <span class="sws-cd__icon" :class="{ 'sws-cd__icon--danger': danger }" aria-hidden="true">
          <q-icon :name="danger ? 'r_warning' : 'r_help'" size="24px" />
        </span>
        <div>
          <h2 :id="titleId" class="sws-cd__title">{{ title }}</h2>
          <p v-if="message" class="sws-cd__msg">{{ message }}</p>
        </div>
      </q-card-section>
      <q-card-section class="sws-cd__body">
        <p v-if="target" class="sws-cd__target">
          <span class="sws-eyebrow">{{ __('Affected') }}</span>
          <strong class="sws-truncate">{{ target }}</strong>
        </p>
        <ul v-if="consequences.length > 0" class="sws-cd__list">
          <li v-for="item in consequences" :key="item">
            <q-icon name="r_chevron_right" size="18px" aria-hidden="true" />{{ item }}
          </li>
        </ul>
        <q-input
          v-if="requireText !== undefined"
          v-model="typed"
          outlined
          dense
          autocomplete="off"
          data-autofocus
          :label="sprintf(__('Type “%s” to confirm'), requireText)"
        />
        <q-checkbox v-if="checkboxLabel !== undefined" v-model="checked" :label="checkboxLabel" />
        <p v-if="error" class="sws-cd__error" role="alert">
          <q-icon name="r_error" size="18px" aria-hidden="true" /> {{ error }}
        </p>
        <slot />
      </q-card-section>
      <q-card-actions align="right" class="sws-cd__actions">
        <q-btn
          flat
          no-caps
          :label="__('Cancel')"
          :disable="loading"
          data-autofocus
          @click="open = false"
        />
        <q-btn
          unelevated
          no-caps
          :color="danger ? 'negative' : 'primary'"
          :label="confirmLabel"
          :loading="loading"
          :disable="!ready"
          @click="emit('confirm')"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.sws-cd__error {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: var(--sws-radius-sm);
  background: var(--sws-danger-bg);
  color: var(--sws-danger-text);
  font-size: 14px;
}
.sws-cd {
  width: min(520px, calc(100vw - 24px));
  max-width: none;
}
.sws-cd__head {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.sws-cd__icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--sws-primary-bg);
  color: var(--sws-primary-text);
}
.sws-cd__icon--danger {
  background: var(--sws-danger-bg);
  color: var(--sws-danger-text);
}
.sws-cd__title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
}
.sws-cd__msg {
  margin-top: 4px;
  color: var(--sws-muted);
}
.sws-cd__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 0;
}
.sws-cd__target {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 14px;
  border-radius: var(--sws-radius-sm);
  background: var(--sws-surface-2);
  border: 1px solid var(--sws-border);
}
.sws-cd__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
}
.sws-cd__list li {
  display: flex;
  gap: 4px;
  align-items: flex-start;
}
.sws-cd__actions {
  padding: 8px 16px 16px;
}
</style>
