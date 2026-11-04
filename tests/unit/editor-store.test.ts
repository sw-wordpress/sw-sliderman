import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { layerBox } from '@editor/document/ops';
import { validateDocument } from '@shared/validate';
import type { SliderDocument } from '@shared/types';
import { fixture } from './fixtures';

/**
 * Save coordination (CODE-STYLE 12.2): a late save response must not mark newer edits as saved,
 * a 409 keeps the local document, and saves never run concurrently.
 */
const api = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), publish: vi.fn() }));
vi.mock('@editor/api', () => ({ sliders: api, fonts: {} }));
vi.mock('@editor/config', () => ({
  getConfig: () => ({ siteId: 1, userId: 1, locale: 'en_US', capabilities: [] }),
  can: () => true,
}));

const { useEditorStore } = await import('@editor/stores/editor');

function doc(): SliderDocument {
  const result = validateDocument(fixture('documents/valid/basic.json'));
  if (!result.ok) throw new Error('fixture');
  return result.document;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('editor store saving', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    api.get.mockResolvedValue({
      id: 7,
      title: 'T',
      status: 'unpublished',
      version: 3,
      modifiedGmt: '',
      publishedGmt: null,
      shortcode: '',
      document: doc(),
      media: {},
      published: null,
    });
    api.save.mockReset();
    await useEditorStore().load(7);
  });

  it('a late response does not mark newer edits as saved', async () => {
    const editor = useEditorStore();
    const first = deferred<{ status: 'saved'; version: number }>();
    api.save
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ status: 'saved', version: 5 });
    editor.updateDocument((d) => (d.settings.loop = false));
    const saving = editor.save();
    editor.updateDocument((d) => (d.settings.showDots = false)); // edit while the request runs
    first.resolve({ status: 'saved', version: 4 });
    await saving;
    expect(editor.serverVersion).toBe(4);
    expect(editor.saveState).toBe('dirty');
    await editor.save();
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.save.mock.calls[1]?.[3]).toBe(4); // expectedVersion of the second save
    expect(editor.saveState).toBe('saved');
    editor.cancelAutosave();
  });

  it('concurrent save calls are serialized', async () => {
    const editor = useEditorStore();
    const first = deferred<{ status: 'saved'; version: number }>();
    api.save.mockReturnValueOnce(first.promise);
    editor.updateDocument((d) => (d.settings.loop = false));
    const a = editor.save();
    const b = editor.save();
    first.resolve({ status: 'saved', version: 4 });
    await Promise.all([a, b]);
    expect(api.save).toHaveBeenCalledTimes(1);
    editor.cancelAutosave();
  });

  it('a conflict keeps local edits and blocks autosave', async () => {
    const editor = useEditorStore();
    api.save.mockResolvedValueOnce({ status: 'conflict', currentVersion: 9 });
    editor.updateDocument((d) => (d.settings.label = 'Mine'));
    await editor.save();
    expect(editor.saveState).toBe('conflict');
    expect(editor.conflictVersion).toBe(9);
    expect(editor.document?.settings.label).toBe('Mine');
    editor.updateDocument((d) => (d.settings.label = 'Mine 2'));
    await editor.save();
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it('invalid documents are not sent', async () => {
    const editor = useEditorStore();
    editor.updateDocument((d) => (d.settings.maxWidth = 1));
    await editor.save();
    expect(api.save).not.toHaveBeenCalled();
    expect(editor.saveState).toBe('invalid');
    editor.cancelAutosave();
  });

  it('a network failure keeps the edits and the expected version', async () => {
    const editor = useEditorStore();
    api.save.mockRejectedValueOnce(new Error('offline'));
    editor.updateDocument((d) => (d.settings.loop = false));
    await editor.save();
    expect(editor.saveState).toBe('error');
    expect(editor.serverVersion).toBe(3);
    expect(editor.document?.settings.loop).toBe(false);
    editor.cancelAutosave();
  });
  it('fits image width and height with aspect ratio, breakpoint overrides, and undo', () => {
    const editor = useEditorStore();
    editor.addLayer('image');
    const id = editor.selectedLayer?.id;
    if (!id) throw new Error('image');
    editor.updateLayer(id, (layer) => {
      if (layer.type === 'image') layer.content.attachmentId = 12;
    });
    editor.rememberMedia(12, { url: '/photo.jpg', width: 1600, height: 800 });
    const original = editor.selectedLayer?.layout;
    editor.fitImage(id, 'width');
    const fitted = editor.selectedLayer;
    if (!fitted || !editor.stage) throw new Error('layer');
    const box = layerBox(fitted, 'desktop', editor.stage.stageWidth, editor.stage.stageHeight);
    expect(box.left).toBe(0);
    expect(box.width).toBe(editor.stage.stageWidth);
    expect(box.width / box.height).toBeCloseTo(2);
    editor.undo();
    expect(editor.selectedLayer?.layout).toEqual(original);
    editor.device = 'mobile';
    editor.fitImage(id, 'height');
    const mobile = editor.selectedLayer;
    if (!mobile || !editor.stage) throw new Error('layer');
    const mobileBox = layerBox(mobile, 'mobile', editor.stage.stageWidth, editor.stage.stageHeight);
    expect(mobileBox.top).toBe(0);
    expect(mobileBox.height).toBe(editor.stage.stageHeight);
    expect(mobileBox.width / mobileBox.height).toBeCloseTo(2);
    expect(mobile.layout).toEqual(original);
    expect(validateDocument(editor.document).ok).toBe(true);
    editor.cancelAutosave();
  });

  it('does not resize locked images', () => {
    const editor = useEditorStore();
    editor.addLayer('image');
    const id = editor.selectedLayer?.id;
    if (!id) throw new Error('image');
    editor.updateLayer(id, (layer) => {
      layer.locked = true;
    });
    const before = editor.document;
    editor.fitImage(id, 'width');
    expect(editor.document).toBe(before);
    editor.cancelAutosave();
  });
});

describe('editor store layer tools', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    api.get.mockResolvedValue({
      id: 7,
      title: 'T',
      status: 'unpublished',
      version: 3,
      modifiedGmt: '',
      publishedGmt: null,
      shortcode: '',
      document: doc(),
      media: {},
      published: null,
    });
    await useEditorStore().load(7);
  });

  it('copies, cuts and pastes layers with fresh ids and an offset', () => {
    const editor = useEditorStore();
    const first = editor.slide?.layers[0];
    if (!first) throw new Error('fixture layer');
    const before = editor.slide?.layers.length ?? 0;
    editor.selectLayer(first.id);
    editor.copyLayers();
    editor.pasteLayers();
    expect(editor.slide?.layers.length).toBe(before + 1);
    const pasted = editor.selectedLayers[0];
    expect(pasted?.id).not.toBe(first.id);
    expect(pasted?.layout.x).toBe(first.layout.x + 20);
    editor.cutLayers();
    expect(editor.slide?.layers.length).toBe(before);
    editor.pasteLayers();
    expect(editor.slide?.layers.length).toBe(before + 1);
    editor.clearSelection();
    editor.copyLayers(); // nothing selected keeps the clipboard
    expect(editor.clipboard.length).toBe(1);
    editor.selectAllLayers();
    expect(editor.selectedLayerIds.length).toBe(before + 1);
    editor.cancelAutosave();
  });

  it('aligns a single layer to the stage, several to their bounds, in one undo step', () => {
    const editor = useEditorStore();
    editor.addLayer('text');
    editor.addLayer('text');
    editor.selectAllLayers();
    const stage = editor.stage;
    if (!stage) throw new Error('stage');
    editor.alignSelected('left');
    const lefts = editor.selectedLayers.map(
      (l) => layerBox(l, 'desktop', stage.stageWidth, stage.stageHeight).left,
    );
    expect(new Set(lefts).size).toBe(1);
    editor.undo();
    editor.selectLayer(editor.selectedLayers[0]?.id ?? '');
    editor.alignSelected('center');
    const only = editor.selectedLayer;
    if (!only) throw new Error('selected');
    const box = layerBox(only, 'desktop', stage.stageWidth, stage.stageHeight);
    expect(box.left + box.width / 2).toBeCloseTo(stage.stageWidth / 2, 0);
    editor.distributeSelected('horizontal'); // fewer than three layers: no-op
    editor.cancelAutosave();
  });
});

describe('editor store structure and responsive tools', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    api.get.mockResolvedValue({
      id: 7,
      title: 'T',
      status: 'unpublished',
      version: 3,
      modifiedGmt: '',
      publishedGmt: null,
      shortcode: '',
      document: doc(),
      media: {},
      published: null,
    });
    await useEditorStore().load(7);
  });

  it('adds, duplicates, reorders and removes slides', () => {
    const editor = useEditorStore();
    const first = editor.document?.slides[0];
    if (!first) throw new Error('slide');
    const initial = editor.document?.slides.length ?? 0;
    editor.addSlide();
    editor.duplicateSlide(first.id);
    const ids = editor.document?.slides.map((s) => s.id) ?? [];
    expect(ids.length).toBe(initial + 2);
    const copyId = ids[1] ?? '';
    expect(copyId).not.toBe(first.id);
    expect(editor.document?.slides[1]?.layers[0]?.id).not.toBe(first.layers[0]?.id);
    editor.moveSlide(copyId, 1);
    expect(editor.document?.slides[2]?.id).toBe(copyId);
    editor.removeSlide(copyId);
    expect(editor.document?.slides.length).toBe(initial + 1);
    editor.undo();
    expect(editor.document?.slides.length).toBe(initial + 2);
    editor.cancelAutosave();
  });

  it('reorders layers and resets a single breakpoint override', () => {
    const editor = useEditorStore();
    editor.addLayer('text');
    const top = editor.selectedLayers[0];
    if (!top) throw new Error('layer');
    const count = editor.slide?.layers.length ?? 0;
    editor.moveLayer(top.id, -1);
    expect(editor.slide?.layers[count - 2]?.id).toBe(top.id);
    editor.device = 'mobile';
    editor.setLayout(top.id, 'x', 123);
    expect(editor.slide?.layers.find((l) => l.id === top.id)?.overrides.mobile?.layout?.x).toBe(
      123,
    );
    editor.resetOverride(top.id, 'layout', 'x');
    expect(
      editor.slide?.layers.find((l) => l.id === top.id)?.overrides.mobile?.layout?.x,
    ).toBeUndefined();
    editor.cancelAutosave();
  });

  it('applies a preview width and jumps to a diagnostic', () => {
    const editor = useEditorStore();
    const bps = editor.document?.breakpoints;
    if (!bps) throw new Error('breakpoints');
    editor.setPreviewWidth(10); // clamped to 200 → mobile
    expect(editor.device).toBe('mobile');
    expect(editor.zoom).toBeCloseTo(200 / bps.mobile.stageWidth);
    editor.setPreviewWidth(Number.NaN); // ignored
    expect(editor.device).toBe('mobile');
    const layer = editor.slide?.layers[0];
    if (!layer) throw new Error('layer');
    editor.device = 'desktop';
    editor.focusDiagnostic({
      code: 'overflow',
      slideId: editor.document?.slides[0]?.id ?? '',
      layerId: layer.id,
      breakpoint: 'tablet',
    });
    expect(editor.device).toBe('tablet');
    expect(editor.selectedLayerIds).toEqual([layer.id]);
    editor.cancelAutosave();
  });
});

describe('editor store mixed edits', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    api.get.mockResolvedValue({
      id: 7,
      title: 'T',
      status: 'unpublished',
      version: 3,
      modifiedGmt: '',
      publishedGmt: null,
      shortcode: '',
      document: doc(),
      media: {},
      published: null,
    });
    await useEditorStore().load(7);
  });

  it('undoes and redoes mixed layout, typography and device edits step by step', () => {
    const editor = useEditorStore();
    editor.addLayer('text');
    const id = editor.selectedLayers[0]?.id ?? '';
    const read = () => editor.slide?.layers.find((l) => l.id === id);
    editor.setLayout(id, 'x', 11); // desktop base
    editor.device = 'mobile';
    editor.setStyle(id, 'fontSize', 33); // mobile override
    editor.setLayout(id, 'x', 22); // mobile override
    editor.device = 'desktop';
    expect(read()?.layout.x).toBe(11);
    expect(read()?.overrides.mobile?.style?.fontSize).toBe(33);
    editor.undo();
    expect(read()?.overrides.mobile?.layout?.x).toBeUndefined();
    expect(read()?.overrides.mobile?.style?.fontSize).toBe(33);
    editor.undo();
    expect(read()?.overrides.mobile?.style?.fontSize).toBeUndefined();
    editor.undo();
    expect(read()?.layout.x).not.toBe(11);
    editor.redo();
    editor.redo();
    editor.redo();
    expect(read()?.layout.x).toBe(11);
    expect(read()?.overrides.mobile?.layout?.x).toBe(22);
    expect(read()?.overrides.mobile?.style?.fontSize).toBe(33);
    editor.cancelAutosave();
  });

  it('keeps zoom, device and preview width out of the document and its history', () => {
    const editor = useEditorStore();
    const before = editor.document;
    editor.zoom = 0.5;
    editor.device = 'tablet';
    editor.setPreviewWidth(500);
    expect(editor.document).toBe(before);
    expect(editor.canUndo).toBe(false);
    expect(editor.dirty).toBe(false);
  });

  it('renames, locks and hides layers per breakpoint without touching others', () => {
    const editor = useEditorStore();
    editor.addLayer('text');
    const id = editor.selectedLayers[0]?.id ?? '';
    const read = () => editor.slide?.layers.find((l) => l.id === id);
    editor.updateLayer(id, (l) => (l.name = 'Headline'));
    expect(read()?.name).toBe('Headline');
    editor.device = 'mobile';
    editor.setLayout(id, 'visible', false);
    expect(read()?.layout.visible).toBe(true);
    expect(read()?.overrides.mobile?.layout?.visible).toBe(false);
    editor.updateLayer(id, (l) => (l.locked = true));
    const box = read()?.layout.x;
    editor.moveLayerBox(
      id,
      { left: 400, top: 400, width: 50, height: 50 },
      { position: true, size: true },
    );
    expect(read()?.layout.x).toBe(box);
    editor.cancelAutosave();
  });
});
