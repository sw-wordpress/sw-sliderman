import { afterAll, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
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
});
