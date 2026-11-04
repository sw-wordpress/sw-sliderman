<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import { LIMITS } from '@shared/limits';
import type { RichParagraph } from '@shared/types';
import { LINK_PATTERN } from '@shared/validate';
import { __ } from '@editor/i18n';
import { docToRich, richToDoc, sameRich, textToRich, type PmNode } from '@editor/document/richtext';
import { richExtensions } from './richExtensions';

/**
 * Limited rich text input (paragraphs, line breaks, bold, italic, links). Loaded lazily with the
 * editor library. Changes are committed to the document model on a pause or when the field loses
 * focus, so one editing burst is one undo step in the slider history; the field's own undo only
 * covers the typing in between. Pasted content is converted by the editor schema.
 */
const props = defineProps<{ rich?: readonly RichParagraph[] | undefined; text: string }>();
const emit = defineEmits<{ (e: 'commit', rich: RichParagraph[]): void }>();

const COMMIT_DELAY_MS = 600;
const model = computed<readonly RichParagraph[]>(() => props.rich ?? textToRich(props.text));
let committed: readonly RichParagraph[] = model.value;
let timer: number | null = null;

const active = reactive({ bold: false, italic: false, link: false });

function refreshState(): void {
  const instance = editor.value;
  if (!instance) return;
  active.bold = instance.isActive('bold');
  active.italic = instance.isActive('italic');
  active.link = instance.isActive('link');
}

function flush(): void {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
  const instance = editor.value;
  if (!instance) return;
  const next = docToRich(instance.getJSON() as PmNode);
  if (sameRich(next, committed)) return;
  committed = next;
  emit('commit', next);
}

const editor = useEditor({
  extensions: richExtensions(),
  content: richToDoc(model.value),
  editorProps: {
    attributes: {
      class: 'sws-rich__surface',
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': __('Text'),
    },
  },
  onUpdate: () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(flush, COMMIT_DELAY_MS);
  },
  onBlur: flush,
  onTransaction: refreshState,
});

// Undo/redo of the slider (or a reload) changes the model from outside: show it in the field.
watch(model, (value) => {
  if (sameRich(value, committed)) return;
  committed = value;
  editor.value?.commands.setContent(richToDoc(value), { emitUpdate: false });
});

onBeforeUnmount(() => {
  flush();
  editor.value?.destroy();
});

const characters = computed(() => editor.value?.storage.characterCount?.characters() ?? 0);

// ---------- link dialog ----------
const linkOpen = ref(false);
const linkUrl = ref('');
const linkNewTab = ref(false);
const linkValid = computed(() => LINK_PATTERN.test(linkUrl.value.trim()));

function openLink(): void {
  const attrs = editor.value?.getAttributes('link') ?? {};
  linkUrl.value = typeof attrs.href === 'string' ? attrs.href : '';
  linkNewTab.value = attrs.newTab === true;
  linkOpen.value = true;
}

function applyLink(): void {
  const instance = editor.value;
  const url = linkUrl.value.trim();
  if (!instance || !LINK_PATTERN.test(url) || url.length > LIMITS.urlLength) return;
  const attrs = { href: url, newTab: linkNewTab.value };
  if (instance.state.selection.empty && !instance.isActive('link')) {
    instance
      .chain()
      .focus()
      .insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs }] })
      .run();
  } else {
    instance.chain().focus().extendMarkRange('link').setMark('link', attrs).run();
  }
  linkOpen.value = false;
  flush();
}

function removeLink(): void {
  editor.value?.chain().focus().extendMarkRange('link').unsetMark('link').run();
  linkOpen.value = false;
  flush();
}
</script>

<template>
  <div class="sws-rich">
    <div class="sws-rich__bar" role="toolbar" :aria-label="__('Text formatting')">
      <q-btn
        flat
        dense
        round
        size="sm"
        icon="r_format_bold"
        :class="{ 'is-on': active.bold }"
        :aria-pressed="active.bold"
        :aria-label="__('Bold')"
        @mousedown.prevent
        @click="editor?.chain().focus().toggleBold().run()"
      >
        <q-tooltip>{{ __('Bold') }}</q-tooltip>
      </q-btn>
      <q-btn
        flat
        dense
        round
        size="sm"
        icon="r_format_italic"
        :class="{ 'is-on': active.italic }"
        :aria-pressed="active.italic"
        :aria-label="__('Italic')"
        @mousedown.prevent
        @click="editor?.chain().focus().toggleItalic().run()"
      >
        <q-tooltip>{{ __('Italic') }}</q-tooltip>
      </q-btn>
      <q-btn
        flat
        dense
        round
        size="sm"
        icon="r_link"
        :class="{ 'is-on': active.link }"
        :aria-pressed="active.link"
        :aria-label="__('Add or edit link')"
        @mousedown.prevent
        @click="openLink"
      >
        <q-tooltip>{{ __('Add or edit link') }}</q-tooltip>
      </q-btn>
      <span class="sws-rich__count sws-num" aria-hidden="true"
        >{{ characters }} / {{ LIMITS.textLength }}</span
      >
    </div>
    <EditorContent v-if="editor" :editor="editor" class="sws-rich__content" />

    <q-dialog v-model="linkOpen">
      <q-card class="sws-dialog">
        <form @submit.prevent="applyLink">
          <q-card-section>
            <h2 class="sws-dialog__title">{{ __('Add or edit link') }}</h2>
          </q-card-section>
          <q-card-section class="sws-rich__dialog">
            <q-input
              v-model="linkUrl"
              outlined
              autofocus
              :maxlength="LIMITS.urlLength"
              :label="__('Link address')"
              :error="linkUrl !== '' && !linkValid"
              :error-message="__('Use https://, mailto:, tel:, / or #.')"
            />
            <q-toggle v-model="linkNewTab" :label="__('Open in a new tab')" />
          </q-card-section>
          <q-card-actions align="right">
            <q-btn
              v-if="active.link"
              flat
              no-caps
              color="negative"
              :label="__('Remove link')"
              @click="removeLink"
            />
            <q-btn flat no-caps :label="__('Cancel')" @click="linkOpen = false" />
            <q-btn
              unelevated
              no-caps
              color="primary"
              type="submit"
              :label="__('Apply')"
              :disable="!linkValid"
            />
          </q-card-actions>
        </form>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.sws-rich {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--sws-border);
  border-radius: var(--sws-radius-sm);
  background: var(--sws-surface);
}
.sws-rich:focus-within {
  border-color: var(--sws-focus);
  box-shadow: 0 0 0 1px var(--sws-focus);
}
.sws-rich__bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--sws-border);
  background: var(--sws-surface-2);
  border-radius: var(--sws-radius-sm) var(--sws-radius-sm) 0 0;
}
.sws-rich__bar .is-on {
  background: var(--sws-primary-bg);
  color: var(--sws-primary-text);
}
.sws-rich__count {
  margin-left: auto;
  font-size: 11px;
  color: var(--sws-muted);
}
.sws-rich__content :deep(.sws-rich__surface) {
  min-height: 88px;
  max-height: 240px;
  overflow-y: auto;
  padding: 8px 10px;
  outline: none;
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.sws-rich__content :deep(.sws-rich__surface p) {
  margin: 0;
}
.sws-rich__content :deep(.sws-rich__surface a) {
  color: var(--sws-primary-text);
  text-decoration: underline;
}
.sws-rich__dialog {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
