import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { Quasar } from 'quasar';
import descriptor from '../../schemas/effects/particle-field.json';
import { validateDocument } from '@shared/validate';
import type { EffectLayer, SliderDocument } from '@shared/types';
import { fixture } from './fixtures';

/** Live preview component with a fake preview module (the real stage is covered in gpu-stage tests). */
const effects = [
  {
    type: descriptor.type,
    label: descriptor.label,
    description: '',
    category: '',
    continuous: true,
    schemaVersion: 1,
    schema: descriptor.schema,
    presets: descriptor.presets,
    assets: descriptor.assets,
    module: '/m/particle-field.js?ver=1',
    builtin: true,
  },
];
const api = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), publish: vi.fn() }));
const fake = vi.hoisted(() => {
  const instances: Array<{
    entry: Record<string, unknown>;
    reduced: () => boolean;
    onState?: ((s: string) => void) | undefined;
    reconfigure: ReturnType<typeof vi.fn>;
    event: ReturnType<typeof vi.fn>;
    setPointer: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];
  return {
    instances,
    createPreview: (
      _host: HTMLElement,
      entry: Record<string, unknown>,
      reduced: () => boolean,
      onState?: (s: string) => void,
    ) => {
      const preview = {
        entry,
        reduced,
        onState,
        reconfigure: vi.fn(() => Promise.resolve()),
        event: vi.fn(),
        setPointer: vi.fn(),
        dispose: vi.fn(),
      };
      instances.push(preview);
      return preview;
    },
  };
});
vi.mock('@editor/api', () => ({ sliders: api, fonts: {} }));
vi.mock('@editor/config', () => ({
  getConfig: () => ({ siteId: 1, userId: 1, locale: 'en_US', capabilities: [], effects }),
  can: () => true,
}));
vi.mock('@gpu/preview', () => ({ createPreview: fake.createPreview }));

const { useEditorStore } = await import('@editor/stores/editor');
const { default: EffectPreview } = await import('@editor/features/effects/EffectPreview.vue');
const { emitEffectEvent } = await import('@editor/effects/bus');

const doc = (): SliderDocument => {
  const result = validateDocument(fixture('documents/valid/basic.json'));
  if (!result.ok) throw new Error('fixture');
  return result.document;
};

async function setup() {
  setActivePinia(createPinia());
  window.localStorage.clear();
  fake.instances.length = 0;
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
  const editor = useEditorStore();
  await editor.load(7);
  editor.addLayer('effect', 'particle-field');
  const layer = (): EffectLayer => {
    const found = editor.selectedLayer;
    if (found?.type !== 'effect') throw new Error('layer');
    return found;
  };
  const Harness = defineComponent({ setup: () => () => h(EffectPreview, { layer: layer() }) });
  const wrapper = mount(Harness, {
    global: { plugins: [Quasar, getActivePinia() as never] },
    attachTo: document.body,
  });
  await flushPromises();
  return { editor, layer, wrapper };
}

describe('EffectPreview', () => {
  beforeEach(() => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('starts one preview with the resolved parameters, the seed and the module URL', async () => {
    const { layer } = await setup();
    expect(fake.instances).toHaveLength(1);
    const entry = fake.instances[0]?.entry as {
      type: string;
      module: string;
      seed: number;
      quality: string;
      params: Record<string, unknown>;
      assets: object;
    };
    expect(entry).toMatchObject({
      type: 'particle-field',
      module: '/m/particle-field.js?ver=1',
      seed: 7319,
      quality: 'auto',
      schemaVersion: 1,
      assets: {},
    });
    expect(entry.params).toMatchObject({
      count: 20000,
      camera: { projection: 'perspective' },
      lifecycle: { mode: 'persistent' },
    });
    expect(layer().content.params).not.toHaveProperty('lifecycle');
  });

  it('applies edited parameters, seed and quality live without recreating the preview', async () => {
    const { editor, layer } = await setup();
    editor.updateLayer(layer().id, (l) => {
      if (l.type === 'effect') {
        l.content.params = { count: 777 };
        l.content.seed = 9;
        l.content.quality = 'low';
      }
    });
    await nextTick();
    expect(fake.instances).toHaveLength(1);
    const call = fake.instances[0]?.reconfigure.mock.calls[0]?.[0] as {
      params: { count: number };
      seed: number;
      quality: string;
    };
    expect([call.params.count, call.seed, call.quality]).toEqual([777, 9, 'low']);
  });

  it('recreates the preview for another picture or effect type and passes the picture URL', async () => {
    const { editor, layer } = await setup();
    editor.rememberMedia(55, { url: '/u/55.jpg', width: 40, height: 30 });
    editor.updateLayer(layer().id, (l) => {
      if (l.type === 'effect') l.content.assets = { image: 55 };
    });
    await flushPromises();
    expect(fake.instances).toHaveLength(2);
    expect(fake.instances[0]?.dispose).toHaveBeenCalledTimes(1);
    expect((fake.instances[1]?.entry as { assets: unknown }).assets).toEqual({
      image: { url: '/u/55.jpg', width: 40, height: 30 },
    });
    // An attachment without preview data is skipped, not fatal.
    editor.updateLayer(layer().id, (l) => {
      if (l.type === 'effect') l.content.assets = { image: 99 };
    });
    await flushPromises();
    expect((fake.instances[2]?.entry as { assets: unknown }).assets).toEqual({});
  });

  it('forwards impulses for its own layer only, and the pointer', async () => {
    const { layer } = await setup();
    emitEffectEvent('someone-else', { type: 'burst' });
    emitEffectEvent(layer().id, { type: 'burst', intensity: 2 });
    expect(fake.instances[0]?.event.mock.calls).toEqual([[{ type: 'burst', intensity: 2 }]]);
    window.dispatchEvent(
      Object.assign(new Event('pointermove'), { clientX: 12, clientY: 34, buttons: 1 }),
    );
    expect(fake.instances[0]?.setPointer).toHaveBeenLastCalledWith({ x: 12, y: 34, down: true });
    document.dispatchEvent(new Event('pointerleave'));
    expect(fake.instances[0]?.setPointer).toHaveBeenLastCalledWith(null);
  });

  it('shows the static image or a placeholder, and reports reduced motion to the stage', async () => {
    const { editor, layer, wrapper } = await setup();
    expect(wrapper.find('.sws-fx__fallback').exists()).toBe(false);
    expect(wrapper.text()).toContain('Particle field');
    editor.rememberMedia(5, { url: '/u/5.jpg', width: 1, height: 1 });
    editor.updateLayer(layer().id, (l) => {
      if (l.type === 'effect') {
        l.content.fallbackImageId = 5;
        l.content.alt = 'Lake';
      }
    });
    await nextTick();
    expect(wrapper.find('img.sws-fx__fallback').attributes()).toMatchObject({
      src: '/u/5.jpg',
      alt: 'Lake',
    });
    expect(fake.instances[0]?.reduced()).toBe(false);
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    expect(fake.instances[0]?.reduced()).toBe(true);
    fake.instances[0]?.onState?.('running');
  });

  it('does not start for an unknown effect type and cleans up on unmount', async () => {
    const { editor, layer, wrapper } = await setup();
    editor.updateLayer(layer().id, (l) => {
      if (l.type === 'effect') l.content.effect = 'gone/plugin';
    });
    await flushPromises();
    expect(wrapper.text()).toContain('gone/plugin');
    expect(wrapper.text()).toContain('not available');
    expect(fake.instances).toHaveLength(1);
    wrapper.unmount();
    expect(fake.instances.every((i) => i.dispose.mock.calls.length >= 1)).toBe(true);
    window.dispatchEvent(
      Object.assign(new Event('pointermove'), { clientX: 1, clientY: 1, buttons: 0 }),
    );
    expect(fake.instances[0]?.setPointer).not.toHaveBeenCalledWith({ x: 1, y: 1, down: false });
  });
});
