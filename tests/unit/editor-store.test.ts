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
