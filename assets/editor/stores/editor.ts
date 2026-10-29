import { computed, ref, shallowRef, watch } from 'vue';
import { defineStore } from 'pinia';
import type {
  BreakpointName,
  Layer,
  LayerLayout,
  LayerStyle,
  LayerType,
  Slide,
  SliderDocument,
} from '@shared/types';
import { collectIssues, type ValidationIssue } from '@shared/validate';
import { LIMITS } from '@shared/limits';
import { sliders } from '@editor/api';
import { ApiError } from '@editor/api/client';
import { issuesOf, type MediaInfo, type SliderDetail } from '@editor/api/sliders';
import { getConfig } from '@editor/config';
import { __, sprintf } from '@editor/i18n';
import { History } from '@editor/document/history';
import { Recovery, type RecoveryEntry } from '@editor/document/recovery';
import {
  cloneLayer,
  cloneSlide,
  createLayer,
  createSlide,
  ensureFontRef,
  findLayer,
  findSlide,
  layerBox,
  moveItem,
  mutable,
  produce,
  pruneFontRefs,
  resetOverride,
  setLayerBox,
  setLayoutValue,
  setStyleValue,
  type DeepMutable,
} from '@editor/document/ops';

/**
 * Editor state (CODE-STYLE 12): the document (with history), UI state (selection, device, zoom)
 * and network state are kept apart. Components call the named actions below; nobody mutates the
 * document directly.
 *
 * Saving: one request at a time. Every edit increments `revision`; a save remembers the revision
 * it sent, so a late response can never mark newer edits as saved. A 409 keeps the local
 * document and switches to the conflict state (reload or export), never overwrites.
 */
export type LoadState = 'idle' | 'loading' | 'ready' | 'error';
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict' | 'invalid';

const AUTOSAVE_MS = 3000;

export const useEditorStore = defineStore('editor', () => {
  const sliderId = ref(0);
  const title = ref('');
  const document = shallowRef<SliderDocument | null>(null);
  const serverVersion = ref(0);
  const published = ref<SliderDetail['published']>(null);
  const shortcode = ref('');
  const previewUrl = ref('');
  const media = ref<Record<number, MediaInfo>>({});

  const loadState = ref<LoadState>('idle');
  const loadError = ref<ApiError | null>(null);
  const saveState = ref<SaveState>('saved');
  const saveError = ref<string | null>(null);
  const issues = ref<readonly ValidationIssue[]>([]);
  const conflictVersion = ref<number | null>(null);
  const recovered = ref<RecoveryEntry | null>(null);
  const publishing = ref(false);

  // UI state – never part of the document history.
  const device = ref<BreakpointName>('desktop');
  const zoom = ref<number | 'fit'>('fit');
  const selectedSlideId = ref<string | null>(null);
  const selectedLayerIds = ref<string[]>([]);
  const previewToken = ref(0);

  const history = new History();
  const historyTick = ref(0);
  let revision = 0;
  let savedRevision = 0;
  let saving: Promise<void> | null = null;
  let autosaveTimer: number | null = null;
  let recovery: Recovery | null = null;

  const slide = computed<Slide | null>(() => {
    const doc = document.value;
    if (!doc) return null;
    return doc.slides.find((s) => s.id === selectedSlideId.value) ?? doc.slides[0] ?? null;
  });
  const selectedLayers = computed<Layer[]>(() =>
    (slide.value?.layers ?? []).filter((layer) => selectedLayerIds.value.includes(layer.id)),
  );
  const selectedLayer = computed<Layer | null>(() =>
    selectedLayers.value.length === 1 ? (selectedLayers.value[0] ?? null) : null,
  );
  const stage = computed(() => document.value?.breakpoints[device.value] ?? null);
  const canUndo = computed(() => historyTick.value >= 0 && history.canUndo);
  const canRedo = computed(() => historyTick.value >= 0 && history.canRedo);
  const dirty = computed(() => saveState.value !== 'saved');

  function apply(next: SliderDocument, record: boolean): void {
    const current = document.value;
    if (!current) return;
    if (record && !history.inGesture) history.commit(current);
    document.value = next;
    revision += 1;
    historyTick.value += 1;
    if (saveState.value !== 'conflict') saveState.value = 'dirty';
    issues.value = collectIssues(next);
    recovery?.write(title.value, next, serverVersion.value);
    scheduleAutosave();
  }

  /** One recorded edit. */
  function edit(recipe: (draft: DeepMutable<SliderDocument>) => void): void {
    if (!document.value) return;
    apply(produce(document.value, recipe), true);
  }

  // ---------- loading ----------
  async function load(id: number): Promise<void> {
    cancelAutosave();
    loadState.value = 'loading';
    loadError.value = null;
    try {
      const detail = await sliders.get(id);
      const config = getConfig();
      recovery = new Recovery(`${config.siteId}:${config.userId}`, id);
      reset(detail);
      const entry = recovery.newest();
      recovered.value =
        entry &&
        entry.baseVersion === detail.version &&
        JSON.stringify(entry.document) !== JSON.stringify(detail.document)
          ? entry
          : null;
      loadState.value = 'ready';
    } catch (error) {
      loadError.value =
        error instanceof ApiError ? error : new ApiError('sws_unknown', String(error), 0);
      loadState.value = 'error';
    }
  }

  function reset(detail: SliderDetail): void {
    sliderId.value = detail.id;
    title.value = detail.title;
    document.value = detail.document;
    serverVersion.value = detail.version;
    published.value = detail.published;
    shortcode.value = detail.shortcode;
    previewUrl.value = detail.previewUrl;
    media.value = { ...detail.media };
    saveState.value = 'saved';
    saveError.value = null;
    conflictVersion.value = null;
    issues.value = [];
    history.clear();
    historyTick.value += 1;
    revision = 0;
    savedRevision = 0;
    selectedSlideId.value = detail.document.slides[0]?.id ?? null;
    selectedLayerIds.value = [];
  }

  function restoreRecovered(): void {
    const entry = recovered.value;
    if (!entry || !document.value) return;
    title.value = entry.title;
    apply(entry.document, true);
    recovered.value = null;
  }

  function discardRecovered(): void {
    recovery?.discardAll();
    recovered.value = null;
  }

  // ---------- saving ----------
  function cancelAutosave(): void {
    if (autosaveTimer !== null) window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  function scheduleAutosave(): void {
    cancelAutosave();
    if (saveState.value === 'conflict') return;
    autosaveTimer = window.setTimeout(() => {
      autosaveTimer = null;
      void save();
    }, AUTOSAVE_MS);
  }

  /** Saves the current draft; concurrent calls wait for the running save and then save again if needed. */
  async function save(): Promise<void> {
    cancelAutosave();
    if (saving) {
      await saving;
      if (revision === savedRevision) return;
    }
    const doc = document.value;
    if (!doc || saveState.value === 'conflict' || revision === savedRevision) return;
    const localIssues = collectIssues(doc);
    if (localIssues.length > 0) {
      issues.value = localIssues;
      saveState.value = 'invalid';
      return;
    }
    const sentRevision = revision;
    saveState.value = 'saving';
    saving = (async () => {
      try {
        const result = await sliders.save(sliderId.value, title.value, doc, serverVersion.value);
        if (result.status === 'saved') {
          serverVersion.value = result.version;
          savedRevision = sentRevision;
          saveError.value = null;
          if (revision === sentRevision) {
            saveState.value = 'saved';
            recovery?.clear();
          } else {
            saveState.value = 'dirty';
            scheduleAutosave();
          }
        } else if (result.status === 'conflict') {
          conflictVersion.value = result.currentVersion;
          saveState.value = 'conflict';
        } else {
          issues.value = result.issues;
          saveState.value = 'invalid';
        }
      } catch (error) {
        // Unknown outcome (timeout/network): keep the edits; the next save uses the same expected
        // version and gets a 409 if the server did apply this one.
        saveState.value = 'error';
        saveError.value = error instanceof ApiError ? error.message : String(error);
      } finally {
        saving = null;
      }
    })();
    await saving;
  }

  async function publish(): Promise<boolean> {
    if (publishing.value) return false;
    publishing.value = true;
    try {
      await save();
      if (saveState.value !== 'saved') return false;
      const result = await sliders.publish(sliderId.value, serverVersion.value);
      published.value = { version: result.version, publishedGmt: result.publishedGmt };
      saveError.value = null;
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'sws_invalid_document') {
        issues.value = issuesOf(error);
      }
      saveError.value = error instanceof ApiError ? error.message : String(error);
      return false;
    } finally {
      publishing.value = false;
    }
  }

  /** Conflict resolution: drop local edits and load the server state. */
  async function reloadFromServer(): Promise<void> {
    recovery?.discardAll();
    await load(sliderId.value);
  }

  function exportJson(): string {
    return JSON.stringify(document.value, null, 2);
  }

  // ---------- history ----------
  function undo(): void {
    const doc = document.value;
    const previous = doc ? history.undo(doc) : null;
    if (previous) apply(previous, false);
  }
  function redo(): void {
    const doc = document.value;
    const next = doc ? history.redo(doc) : null;
    if (next) apply(next, false);
  }
  function beginGesture(): void {
    if (document.value) history.beginGesture(document.value);
  }
  function endGesture(): void {
    if (document.value) history.endGesture(document.value);
    historyTick.value += 1;
  }
  function cancelGesture(): void {
    const start = history.cancelGesture();
    if (start) apply(start, false);
  }
  /** Change during a gesture: applied, but recorded only once by endGesture(). */
  function gestureEdit(recipe: (draft: DeepMutable<SliderDocument>) => void): void {
    if (!document.value) return;
    apply(produce(document.value, recipe), !history.inGesture);
  }

  // ---------- selection ----------
  function selectSlide(id: string): void {
    selectedSlideId.value = id;
    selectedLayerIds.value = [];
  }
  function selectLayer(id: string, additive = false): void {
    if (additive) {
      selectedLayerIds.value = selectedLayerIds.value.includes(id)
        ? selectedLayerIds.value.filter((l) => l !== id)
        : [...selectedLayerIds.value, id];
    } else {
      selectedLayerIds.value = [id];
    }
  }
  function clearSelection(): void {
    selectedLayerIds.value = [];
  }

  // ---------- slide actions ----------
  function addSlide(): void {
    const doc = document.value;
    if (!doc || doc.slides.length >= LIMITS.slides) return;
    const created = createSlide(sprintf(__('Slide %d'), doc.slides.length + 1));
    edit((draft) => {
      draft.slides.push(mutable(created));
    });
    selectSlide(created.id);
  }
  function duplicateSlide(id: string): void {
    const doc = document.value;
    const source = doc?.slides.find((s) => s.id === id);
    if (!doc || !source || doc.slides.length >= LIMITS.slides) return;
    const copy = cloneSlide(source, sprintf(__('%s (copy)'), source.name));
    edit((draft) => {
      const index = draft.slides.findIndex((s) => s.id === id);
      draft.slides.splice(index + 1, 0, mutable(copy));
    });
    selectSlide(copy.id);
  }
  function removeSlide(id: string): void {
    const doc = document.value;
    if (!doc || doc.slides.length <= 1) return;
    const index = doc.slides.findIndex((s) => s.id === id);
    edit((draft) => {
      draft.slides.splice(index, 1);
      pruneFontRefs(draft);
    });
    const next = document.value?.slides[Math.max(0, index - 1)];
    if (next) selectSlide(next.id);
  }
  function moveSlide(id: string, delta: number): void {
    edit((draft) =>
      moveItem(
        draft.slides,
        draft.slides.findIndex((s) => s.id === id),
        delta,
      ),
    );
  }
  function updateSlide(id: string, recipe: (slide: DeepMutable<Slide>) => void): void {
    edit((draft) => {
      const target = findSlide(draft, id);
      if (target) recipe(target);
    });
  }

  // ---------- layer actions ----------
  function addLayer(type: LayerType): void {
    const current = slide.value;
    const doc = document.value;
    if (!current || !doc || current.layers.length >= LIMITS.layersPerSlide) return;
    const names: Record<LayerType, string> = {
      text: __('Text'),
      image: __('Image'),
      button: __('Button'),
    };
    const desktop = doc.breakpoints.desktop;
    const layer = createLayer(type, desktop.stageWidth, desktop.stageHeight, names[type]);
    edit((draft) => {
      findSlide(draft, current.id)?.layers.push(mutable(layer));
    });
    selectedLayerIds.value = [layer.id];
  }
  function duplicateLayers(): void {
    const current = slide.value;
    if (!current) return;
    const copies = selectedLayers.value.map((layer) =>
      cloneLayer(layer, sprintf(__('%s (copy)'), layer.name)),
    );
    if (copies.length === 0 || current.layers.length + copies.length > LIMITS.layersPerSlide)
      return;
    edit((draft) => {
      const target = findSlide(draft, current.id);
      copies.forEach((copy) => {
        const moved = {
          ...copy,
          layout: { ...copy.layout, x: copy.layout.x + 20, y: copy.layout.y + 20 },
        };
        target?.layers.push(mutable(moved));
      });
    });
    selectedLayerIds.value = copies.map((c) => c.id);
  }
  function removeLayers(ids: string[] = selectedLayerIds.value): void {
    if (ids.length === 0) return;
    edit((draft) => {
      draft.slides.forEach((s) => {
        s.layers = s.layers.filter((l) => !ids.includes(l.id));
      });
      pruneFontRefs(draft);
    });
    selectedLayerIds.value = [];
  }
  /** Z-order: +1 moves a layer up (rendered later = on top). */
  function moveLayer(id: string, delta: number): void {
    const current = slide.value;
    if (!current) return;
    edit((draft) => {
      const target = findSlide(draft, current.id);
      if (target)
        moveItem(
          target.layers,
          target.layers.findIndex((l) => l.id === id),
          delta,
        );
    });
  }
  function updateLayer(id: string, recipe: (layer: DeepMutable<Layer>) => void): void {
    edit((draft) => {
      const layer = findLayer(draft, id);
      if (layer) recipe(layer);
    });
  }
  function setLayout<K extends keyof LayerLayout>(id: string, key: K, value: LayerLayout[K]): void {
    updateLayer(id, (layer) => setLayoutValue(layer, device.value, key, value));
  }
  function setStyle<K extends keyof LayerStyle>(id: string, key: K, value: LayerStyle[K]): void {
    updateLayer(id, (layer) => setStyleValue(layer, device.value, key, value));
  }
  function resetLayerOverride(id: string, group: 'layout' | 'style', key: string): void {
    updateLayer(id, (layer) => resetOverride(layer, device.value, group, key));
  }
  function setLayerFont(
    id: string,
    font: { installationId: string; weight: number; style: 'normal' | 'italic' } | null,
  ): void {
    edit((draft) => {
      const layer = findLayer(draft, id);
      if (!layer) return;
      layer.style.fontRef = font
        ? ensureFontRef(draft, font.installationId, font.weight, font.style)
        : null;
      pruneFontRefs(draft);
    });
  }
  /** Drag/resize/keyboard move in stage pixels of the current device. */
  function moveLayerBox(
    id: string,
    box: { left: number; top: number; width: number; height: number },
    changed: { position: boolean; size: boolean },
  ): void {
    const current = stage.value;
    if (!current) return;
    gestureEdit((draft) => {
      const layer = findLayer(draft, id);
      if (layer && !layer.locked)
        setLayerBox(layer, device.value, current.stageWidth, current.stageHeight, box, changed);
    });
  }
  /** One undoable edit, using the existing anchor/breakpoint conversion. */
  function fitImage(id: string, axis: 'width' | 'height'): void {
    const layer = slide.value?.layers.find((item) => item.id === id);
    const current = stage.value;
    if (!layer || layer.type !== 'image' || layer.locked || !current) return;
    const box = layerBox(layer, device.value, current.stageWidth, current.stageHeight);
    const image =
      layer.content.attachmentId === null ? null : media.value[layer.content.attachmentId];
    const ratio =
      image && image.width > 0 && image.height > 0
        ? image.width / image.height
        : box.width / box.height;
    const width = axis === 'width' ? current.stageWidth : current.stageHeight * ratio;
    const height = axis === 'height' ? current.stageHeight : current.stageWidth / ratio;
    if (
      ![width, height].every(
        (size) => Number.isFinite(size) && size >= LIMITS.sizeMin && size <= LIMITS.sizeMax,
      )
    )
      return;
    edit((draft) => {
      const target = findLayer(draft, id);
      if (target)
        setLayerBox(
          target,
          device.value,
          current.stageWidth,
          current.stageHeight,
          {
            left: (current.stageWidth - width) / 2,
            top: (current.stageHeight - height) / 2,
            width,
            height,
          },
          { position: true, size: true },
        );
    });
  }
  function updateDocument(recipe: (draft: DeepMutable<SliderDocument>) => void): void {
    edit(recipe);
  }
  function setTitle(value: string): void {
    title.value = value;
    if (document.value) apply(document.value, false);
  }
  function rememberMedia(id: number, info: MediaInfo): void {
    media.value = { ...media.value, [id]: info };
  }
  function playPreview(): void {
    previewToken.value += 1;
  }

  // Keep the selection valid after undo/redo or deletions.
  watch(document, (doc) => {
    if (!doc) return;
    if (!doc.slides.some((s) => s.id === selectedSlideId.value))
      selectedSlideId.value = doc.slides[0]?.id ?? null;
    const ids = new Set(doc.slides.flatMap((s) => s.layers.map((l) => l.id)));
    selectedLayerIds.value = selectedLayerIds.value.filter((id) => ids.has(id));
  });

  return {
    sliderId,
    title,
    document,
    serverVersion,
    published,
    shortcode,
    previewUrl,
    media,
    loadState,
    loadError,
    saveState,
    saveError,
    issues,
    conflictVersion,
    recovered,
    publishing,
    device,
    zoom,
    selectedSlideId,
    selectedLayerIds,
    previewToken,
    slide,
    selectedLayers,
    selectedLayer,
    stage,
    canUndo,
    canRedo,
    dirty,
    load,
    save,
    publish,
    reloadFromServer,
    exportJson,
    restoreRecovered,
    discardRecovered,
    undo,
    redo,
    beginGesture,
    endGesture,
    cancelGesture,
    selectSlide,
    selectLayer,
    clearSelection,
    addSlide,
    duplicateSlide,
    removeSlide,
    moveSlide,
    updateSlide,
    addLayer,
    duplicateLayers,
    removeLayers,
    moveLayer,
    updateLayer,
    setLayout,
    setStyle,
    resetOverride: resetLayerOverride,
    setLayerFont,
    moveLayerBox,
    fitImage,
    updateDocument,
    setTitle,
    rememberMedia,
    playPreview,
    cancelAutosave,
  };
});
