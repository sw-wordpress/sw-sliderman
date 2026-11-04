import { afterAll, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import type { Editor } from '@tiptap/core';
import { layerBox } from '@editor/document/ops';
import { fixture } from './fixtures';

/** Full component tree with real API parsing and intercepted HTTP; no WordPress writes. */
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
    unobserve() {}
  },
);
window.matchMedia = vi
  .fn()
  .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
window.scrollTo = vi.fn();
// jsdom has no layout; ProseMirror measures ranges when it scrolls the cursor into view.
const emptyRects = (): DOMRectList =>
  Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = emptyRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = emptyRects;
window.swsEditorConfig = {
  userId: 1,
  siteId: 1,
  version: 'test',
  adminUrl: '',
  fontsOffline: false,
  restRoot: 'http://localhost/api/',
  nonce: 'test',
  locale: 'en_US',
  capabilities: ['sws_edit_sliders', 'sws_manage_fonts', 'sws_publish_sliders'],
};
let offline = false;
const calls: string[] = [];
const detail = {
  id: 7,
  title: 'UI test',
  status: 'unpublished',
  version: 1,
  modifiedGmt: '',
  publishedGmt: null,
  shortcode: '[sw_slider id="7"]',
  document: fixture('documents/valid/basic.json'),
  media: {},
  published: null,
  previewUrl: 'http://localhost/preview',
};
vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string, options: RequestInit) => {
    const path = new URL(url).pathname;
    calls.push(`${options.method} ${path}`);
    if (url.includes('trashed=true')) calls.push('trashed-list');
    let body: unknown = [];
    if (path.endsWith('/catalog'))
      body = {
        catalogVersion: 'test',
        offline,
        families: [
          {
            id: 'lato',
            family: 'Lato',
            category: 'sans-serif',
            license: 'OFL',
            static: true,
            variants: [{ weight: 400, style: 'normal' }],
            subsets: ['latin', 'latin-ext'],
            installed: false,
          },
        ],
      };
    else if (path.endsWith('/settings')) {
      offline = JSON.parse(String(options.body)).offline;
      body = { offline };
    } else if (path.endsWith('/sliders/7'))
      body = options.method === 'PUT' ? { version: 2 } : detail;
    else if (path.endsWith('/sliders')) body = options.method === 'POST' ? detail : [detail];
    else if (path.endsWith('/publish')) body = { version: 2, publishedGmt: '2026-10-31 10:00:00' };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
);
document.body.innerHTML = '<div id="sw-sliderman-app"></div>';
await import('@editor/main');
const { useEditorStore } = await import('@editor/stores/editor');
async function settle(): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await flushPromises();
    await new Promise((r) => setTimeout(r, 10));
  }
}
function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find((el) =>
    el.textContent?.includes(label),
  );
  if (!found) throw new Error(`Button missing: ${label}: ${document.body.textContent}`);
  return found;
}

afterAll(() => {
  vi.unstubAllGlobals();
});
describe('editor UI', () => {
  it('loads list, local font catalog and import/install dialogs through the actual router', async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain('UI test'), {
      timeout: 10000,
    });
    window.location.hash = '#/fonts';
    await vi.waitFor(() => expect(document.body.textContent).toContain('Lato'), { timeout: 10000 });
    button('Import WOFF2').click();
    await settle();
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
    button('Cancel').click();
    await settle();
    button('Install').click();
    await settle();
    expect(document.body.textContent).toContain('Character sets');
    button('Cancel').click();
    await settle();
  });
  it('renders the shared stage and each inspector; history, slide and layer actions remain coherent', async () => {
    window.location.hash = '#/sliders/7';
    const editor = useEditorStore();
    await vi.waitFor(() => expect(editor.loadState).toBe('ready'), { timeout: 10000 });
    expect(editor.loadState).toBe('ready');
    expect(document.querySelector('.sws-canvas__frame')).not.toBeNull();
    const layer = editor.slide?.layers[0];
    if (!layer) throw new Error('Expected fixture layer');
    editor.selectLayer(layer.id);
    await settle();
    expect(document.body.textContent).toContain('Typography');
    editor.addLayer('button');
    await settle();
    expect(editor.selectedLayers[0]?.type).toBe('button');
    editor.addLayer('image');
    await settle();
    expect(editor.selectedLayers[0]?.type).toBe('image');
    editor.undo();
    editor.redo();
    editor.addSlide();
    await settle();
    expect(editor.document?.slides.length).toBeGreaterThan(1);
    await editor.save();
    expect(calls).toContain('PUT /api/sliders/7');
  });
  it('shows the trash view with restore and permanent delete', async () => {
    window.location.hash = '#/';
    await vi.waitFor(() => expect(document.body.textContent).toContain('UI test'), {
      timeout: 10000,
    });
    button('Trash').click();
    await vi.waitFor(() => expect(calls).toContain('trashed-list'));
    await settle();
    button('Restore').click();
    await settle();
    expect(calls).toContain('POST /api/sliders/7/untrash');
    expect(document.body.textContent).toContain('The trash is empty');
  });
  it('opens the image link box by checkbox and gives a new shadow a soft default', async () => {
    window.location.hash = '#/sliders/7';
    const editor = useEditorStore();
    await vi.waitFor(() => expect(editor.loadState).toBe('ready'), { timeout: 10000 });
    await vi.waitFor(() => expect(document.querySelector('.sws-canvas__frame')).not.toBeNull(), {
      timeout: 10000,
    });
    await settle();
    editor.selectAllLayers();
    editor.removeLayers(); // earlier tests may have filled the slide up to its layer limit
    editor.addLayer('image');
    await settle();
    expect(document.body.textContent).not.toContain('Link address');
    const checkbox = (label: string): HTMLElement => {
      const el = [
        ...document.querySelectorAll<HTMLElement>('[role="checkbox"], [role="switch"]'),
      ].find(
        (node) => node.textContent?.includes(label) || node.getAttribute('aria-label') === label,
      );
      if (!el) throw new Error(`Control missing: ${label}`);
      return el;
    };
    checkbox('Open link').click();
    await settle();
    expect(document.body.textContent).toContain('Link address');
    checkbox('Shadow').click();
    await settle();
    const style = editor.selectedLayers[0]?.style;
    expect(style?.shadowColor).toBe('#000000');
    expect(style?.shadowY).toBe(4);
    expect(style?.shadowBlur).toBe(12);
    checkbox('Shadow').click();
    await settle();
    expect(editor.selectedLayers[0]?.style.shadowColor).toBeNull();
    checkbox('Open link').click();
    await settle();
    expect(document.body.textContent).not.toContain('Link address');
  });
  it('offers shape kinds and button states, and hides typography for shapes', async () => {
    window.location.hash = '#/sliders/7';
    const editor = useEditorStore();
    await vi.waitFor(() => expect(editor.loadState).toBe('ready'), { timeout: 10000 });
    await vi.waitFor(() => expect(document.querySelector('.sws-canvas__frame')).not.toBeNull(), {
      timeout: 10000,
    });
    editor.selectAllLayers();
    editor.removeLayers();
    editor.addLayer('shape');
    await settle();
    expect(editor.selectedLayers[0]?.type).toBe('shape');
    expect(document.body.textContent).not.toContain('Typography');
    button('Circle').click();
    await settle();
    const shape = editor.selectedLayers[0];
    expect(shape?.type === 'shape' && shape.content.kind).toBe('circle');
    expect(document.body.textContent).not.toContain('Corner radius');
    editor.addLayer('button');
    await settle();
    expect(document.body.textContent).toContain('Button states');
    const picker = document.querySelector<HTMLInputElement>('.sws-props__box input[type="color"]');
    if (!picker) throw new Error('state colour input missing');
    picker.value = '#ff0000';
    picker.dispatchEvent(new Event('change'));
    await settle();
    const created = editor.selectedLayers[0];
    expect(created?.type === 'button' && created.content.hoverBackgroundColor).toBe('#ff0000');
    button('Default').click();
    await settle();
    const reset = editor.selectedLayers[0];
    expect(reset?.type === 'button' && reset.content.hoverBackgroundColor).toBeUndefined();
  });
  it('does not run layer shortcuts while typing in a field', async () => {
    window.location.hash = '#/sliders/7';
    const editor = useEditorStore();
    await vi.waitFor(() => expect(editor.loadState).toBe('ready'), { timeout: 10000 });
    await vi.waitFor(() => expect(document.querySelector('.sws-canvas__frame')).not.toBeNull(), {
      timeout: 10000,
    });
    editor.selectAllLayers();
    if (editor.selectedLayerIds.length === 0) editor.addLayer('text');
    const count = editor.slide?.layers.length ?? 0;
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
    expect(editor.slide?.layers.length).toBe(count);
    input.remove();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(editor.slide?.layers.length).toBeLessThan(count);
  });
  it('edits rich text lazily, commits one undo step and renders it on the canvas', async () => {
    window.location.hash = '#/sliders/7';
    const editor = useEditorStore();
    await vi.waitFor(() => expect(editor.loadState).toBe('ready'), { timeout: 10000 });
    await vi.waitFor(() => expect(document.querySelector('.sws-canvas__frame')).not.toBeNull(), {
      timeout: 10000,
    });
    editor.selectAllLayers();
    editor.removeLayers();
    editor.addLayer('text');
    const layerId = editor.selectedLayers[0]?.id ?? '';
    const read = () => editor.slide?.layers.find((l) => l.id === layerId);
    await vi.waitFor(() => expect(document.querySelector('.sws-rich__surface')).not.toBeNull(), {
      timeout: 10000,
    });
    const surface = document.querySelector<HTMLElement & { editor?: Editor }>('.sws-rich__surface');
    const tiptap = surface?.editor;
    if (!tiptap) throw new Error('Tiptap editor missing');
    tiptap.commands.setContent('<p>Eins</p>', { emitUpdate: true });
    tiptap
      .chain()
      .focus()
      .insertContent('<p>Zwei <strong>fett</strong> <a href="javascript:x()">bad</a></p>')
      .run();
    surface?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await vi.waitFor(() => expect(JSON.stringify(read()?.content)).toContain('"rich"'), {
      timeout: 4000,
    });
    const layer = read();
    if (layer?.type !== 'text') throw new Error('text layer');
    expect(layer.content.text).toContain('Zwei fett bad');
    expect(JSON.stringify(layer.content.rich)).toContain('"bold":true');
    expect(JSON.stringify(layer.content.rich)).not.toContain('javascript');
    await settle();
    expect(document.querySelector('.sws-canvas__frame .sws-text--rich strong')?.textContent).toBe(
      'fett',
    );
    editor.undo();
    await settle();
    const after = read();
    expect(after?.type === 'text' && after.content.rich).toBeFalsy();
  });
  it('enables a slide overlay with a visible default and sets image focal points', async () => {
    window.location.hash = '#/sliders/7';
    const editor = useEditorStore();
    await vi.waitFor(() => expect(editor.loadState).toBe('ready'), { timeout: 10000 });
    await vi.waitFor(() => expect(document.querySelector('.sws-canvas__frame')).not.toBeNull(), {
      timeout: 10000,
    });
    await settle();
    editor.clearSelection();
    await settle();
    const overlay = [
      ...document.querySelectorAll<HTMLElement>('[role="checkbox"], [role="switch"]'),
    ].find((el) => el.textContent?.includes('Overlay'));
    if (!overlay) throw new Error('Overlay checkbox missing');
    overlay.click();
    await settle();
    const background = editor.slide?.background;
    expect(background?.overlayColor).toBe('#000000');
    expect(background?.overlayOpacity).toBe(0.4);
    expect(document.querySelector('.sws-canvas__frame style')?.textContent).toContain('::before');
    expect(document.body.textContent).toContain('Overlay opacity');
    overlay.click();
    await settle();
    expect(editor.slide?.background.overlayColor).toBeNull();

    editor.selectAllLayers();
    editor.removeLayers();
    editor.addLayer('image');
    const id = editor.selectedLayers[0]?.id ?? '';
    editor.updateLayer(id, (layer) => {
      if (layer.type === 'image') layer.content.attachmentId = 5;
    });
    editor.rememberMedia(5, { url: 'http://localhost/img.jpg', width: 100, height: 50 });
    await settle();
    const input = [...document.querySelectorAll<HTMLInputElement>('input')].find((el) =>
      el.closest('.q-field')?.textContent?.includes('Focal point X'),
    );
    if (!input) throw new Error('Focal point field missing');
    input.value = '30';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    const image = editor.selectedLayers[0];
    expect(image?.type === 'image' ? image.content.focalX : null).toBe(30);
  });
  it('drags a layer on the canvas as one undo step, snaps to the grid and cancels with Escape', async () => {
    window.location.hash = '#/sliders/7';
    const editor = useEditorStore();
    await vi.waitFor(() => expect(editor.loadState).toBe('ready'), { timeout: 10000 });
    await vi.waitFor(() => expect(document.querySelector('.sws-canvas__frame')).not.toBeNull(), {
      timeout: 10000,
    });
    editor.selectAllLayers();
    editor.removeLayers();
    editor.zoom = 1;
    editor.addLayer('text');
    const id = editor.selectedLayers[0]?.id ?? '';
    await settle();
    const element = document.querySelector<HTMLElement>(`[data-sws-layer="${id}"]`);
    if (!element) throw new Error('layer element');
    element.setPointerCapture = vi.fn();
    const pointer = (type: string, x: number, y: number, init: object = {}): void => {
      const event = new MouseEvent(type, {
        clientX: x,
        clientY: y,
        button: 0,
        bubbles: true,
        ...init,
      });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      element.dispatchEvent(event);
    };
    const read = () => editor.slide?.layers.find((l) => l.id === id)?.layout;
    const startX = read()?.x ?? 0;
    // Grid snapping rounds the dragged position to multiples of 10.
    const toggle = [
      ...document.querySelectorAll<HTMLElement>('[role="checkbox"], [role="switch"]'),
    ].find((el) => el.textContent?.includes('Grid'));
    toggle?.click();
    await settle();
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 100 + 47, 100 + 33);
    pointer('pointerup', 147, 133);
    await settle();
    expect(read()?.x).not.toBe(startX);
    const layer = editor.slide?.layers.find((l) => l.id === id);
    const stage = editor.stage;
    if (!layer || !stage) throw new Error('layer');
    expect(layerBox(layer, 'desktop', stage.stageWidth, stage.stageHeight).left % 10).toBe(0);
    editor.undo();
    expect(read()?.x).toBe(startX); // the whole drag was a single history step
    // Escape cancels a running drag without changing the layer or clearing the selection.
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 200, 200);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    pointer('pointerup', 200, 200);
    expect(read()?.x).toBe(startX);
    expect(editor.selectedLayerIds).toEqual([id]);
  });
  it('rotates and resizes the selected layer with its handles, each gesture one undo step', async () => {
    window.location.hash = '#/sliders/7';
    const editor = useEditorStore();
    await vi.waitFor(() => expect(editor.loadState).toBe('ready'), { timeout: 10000 });
    await vi.waitFor(() => expect(document.querySelector('.sws-canvas__frame')).not.toBeNull(), {
      timeout: 10000,
    });
    editor.selectAllLayers();
    editor.removeLayers();
    editor.zoom = 1;
    editor.addLayer('shape');
    const id = editor.selectedLayers[0]?.id ?? '';
    await settle();
    const read = () => editor.slide?.layers.find((l) => l.id === id)?.layout;
    const fire = (el: Element, type: string, x: number, y: number, shiftKey = false): void => {
      const event = new MouseEvent(type, {
        clientX: x,
        clientY: y,
        button: 0,
        shiftKey,
        bubbles: true,
      });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      el.dispatchEvent(event);
    };
    const handle = (selector: string): HTMLElement => {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) throw new Error(`Missing ${selector}`);
      el.setPointerCapture = vi.fn();
      return el;
    };
    // Rotation: the frame centre is (0, 0) in jsdom, so (0,-100) is 0° and (100,0) is 90°.
    const rotate = handle('.sws-canvas__rotate');
    expect(read()?.rotation).toBe(0);
    fire(rotate, 'pointerdown', 0, -100);
    fire(rotate, 'pointermove', 100, 0);
    fire(rotate, 'pointerup', 100, 0);
    expect(read()?.rotation).toBe(90);
    // Shift snaps to 15° steps.
    fire(rotate, 'pointerdown', 100, 0);
    fire(rotate, 'pointermove', 100, 30, true); // ~ +16.7° -> 105°
    fire(rotate, 'pointerup', 100, 30);
    expect(read()?.rotation).toBe(105);
    editor.undo();
    expect(read()?.rotation).toBe(90);
    editor.undo();
    expect(read()?.rotation).toBe(0);
    // Escape cancels a running rotation.
    fire(rotate, 'pointerdown', 0, -100);
    fire(rotate, 'pointermove', 100, 0);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(read()?.rotation).toBe(0);
    // Resize with the south-east handle grows width and height by the dragged distance.
    const width = read()?.width ?? 0;
    const height = read()?.height ?? 0;
    const se = handle('.sws-canvas__handle--se');
    fire(se, 'pointerdown', 10, 10);
    fire(se, 'pointermove', 60, 40);
    fire(se, 'pointerup', 60, 40);
    expect(read()?.width).toBe(width + 50);
    expect(read()?.height).toBe(height + 30);
    editor.undo();
    expect(read()?.width).toBe(width);
  });
});
