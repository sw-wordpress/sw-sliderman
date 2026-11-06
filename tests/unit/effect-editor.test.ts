import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { Quasar, QBtn, QInput, QSelect, QSlider, QToggle } from 'quasar';
import descriptor from '../../schemas/effects/particle-field.json';
import { validateDocument } from '@shared/validate';
import type { EffectLayer, SliderDocument } from '@shared/types';
import { fixture } from './fixtures';

/** The effect panel with the real particle-field schema against the real editor store. */
const effects = [
  {
    type: descriptor.type,
    label: descriptor.label,
    description: descriptor.description,
    category: descriptor.category,
    continuous: descriptor.continuous,
    schemaVersion: descriptor.schemaVersion,
    schema: descriptor.schema,
    presets: descriptor.presets,
    assets: descriptor.assets,
    module: '/wp-content/plugins/sw-sliderman/build/gpu/particle-field.js?ver=1',
    builtin: true,
  },
];
const api = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), publish: vi.fn() }));
const picker = vi.hoisted(() => ({ pickImage: vi.fn() }));
vi.mock('@editor/api', () => ({ sliders: api, fonts: {} }));
vi.mock('@editor/config', () => ({
  getConfig: () => ({ siteId: 1, userId: 1, locale: 'en_US', capabilities: [], effects }),
  can: () => true,
}));
vi.mock('@editor/composables/useMediaPicker', () => ({
  pickImage: picker.pickImage,
  previewOf: (a: { url: string }) => ({ url: a.url, width: 100, height: 50 }),
}));

const { useEditorStore } = await import('@editor/stores/editor');
const { default: EffectProperties } = await import('@editor/features/effects/EffectProperties.vue');
const { onEffectEvent } = await import('@editor/effects/bus');
const { resetSections } = await import('@editor/composables/useAccordion');

function basic(): SliderDocument {
  const result = validateDocument(fixture('documents/valid/basic.json'));
  if (!result.ok) throw new Error('fixture');
  return result.document;
}

const first = () => {
  const found = effects[0];
  if (!found) throw new Error('effect');
  return found;
};
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
});

async function setup(effect = 'particle-field') {
  setActivePinia(createPinia());
  window.localStorage.clear();
  resetSections();
  api.get.mockResolvedValue({
    id: 7,
    title: 'T',
    status: 'unpublished',
    version: 3,
    modifiedGmt: '',
    publishedGmt: null,
    shortcode: '',
    document: basic(),
    media: {},
    published: null,
  });
  const editor = useEditorStore();
  await editor.load(7);
  editor.addLayer('effect', effect);
  const layer = (): EffectLayer => {
    const found = editor.selectedLayer;
    if (found?.type !== 'effect') throw new Error('no effect layer selected');
    return found;
  };
  const Harness = defineComponent({
    setup: () => () => h(EffectProperties, { layer: layer() }),
  });
  const wrapper = mount(Harness, {
    global: { plugins: [Quasar, (await import('pinia')).getActivePinia() as never] },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  await flushPromises();
  return { editor, layer, wrapper };
}

describe('effect layer in the editor store', () => {
  it('adds a full-stage effect layer that starts from the first preset and passes validation', async () => {
    const { editor, layer } = await setup();
    const doc = editor.document;
    const stage = doc?.breakpoints.desktop;
    const l = layer();
    expect(l.content).toMatchObject({
      effect: 'particle-field',
      preset: 'orbital-mist',
      schemaVersion: 1,
      quality: 'auto',
      alt: '',
      fallbackImageId: null,
    });
    expect(l.content.seed).toBe(7319);
    expect([l.layout.width, l.layout.height, l.layout.x, l.layout.y]).toEqual([
      stage?.stageWidth,
      stage?.stageHeight,
      0,
      0,
    ]);
    expect(editor.issues).toEqual([]);
  });

  it('refuses a fourth effect layer on a slide and unknown effect types', async () => {
    const { editor } = await setup();
    editor.addLayer('effect', 'particle-field');
    editor.addLayer('effect', 'particle-field');
    const count = () => editor.slide?.layers.filter((l) => l.type === 'effect').length;
    expect(count()).toBe(3);
    editor.addLayer('effect', 'particle-field');
    expect(count()).toBe(3);
    editor.addLayer('effect', 'unknown/type');
    expect(count()).toBe(3);
  });

  it('keeps duplicating and pasting within the effect layer limit', async () => {
    const { editor } = await setup();
    editor.addLayer('effect', 'particle-field');
    editor.addLayer('effect', 'particle-field');
    const count = () => editor.slide?.layers.filter((l) => l.type === 'effect').length;
    expect(count()).toBe(3);
    editor.duplicateLayers();
    expect(count()).toBe(3);
    editor.copyLayers();
    editor.pasteLayers();
    expect(count()).toBe(3);
  });

  it('reports invalid parameters through the registered schema', async () => {
    const { editor, layer } = await setup();
    editor.updateLayer(layer().id, (l) => {
      if (l.type === 'effect') l.content.params = { count: 0 };
    });
    expect(editor.issues.map((i) => i.code)).toContain('range');
    expect(editor.issues[0]?.path).toMatch(/\/content\/params\/count$/);
  });
});

describe('EffectProperties', () => {
  beforeEach(() => picker.pickImage.mockReset());

  it('lists the presets, marks the current one and applies another with its seed and parameters', async () => {
    const { wrapper, layer } = await setup();
    const buttons = wrapper
      .findAllComponents(QBtn)
      .filter((b) => b.attributes('aria-pressed') !== undefined);
    expect(buttons.map((b) => b.props('label'))).toEqual(descriptor.presets.map((p) => p.name));
    expect(buttons[0]?.attributes('aria-pressed')).toBe('true');
    await buttons[1]?.trigger('click');
    await flushPromises();
    expect(layer().content.preset).toBe('vortex-ribbons');
    expect(layer().content.seed).toBe(4242);
    expect(layer().content.params).toEqual(descriptor.presets[1]?.params);
    expect(
      wrapper
        .findAllComponents(QBtn)
        .filter((b) => b.attributes('aria-pressed') !== undefined)[1]
        ?.attributes('aria-pressed'),
    ).toBe('true');
  });

  it('edits numbers through the slider and the number input, clamped to the schema range; presets reset', async () => {
    const { wrapper, layer } = await setup();
    const count = wrapper.findAll('input.sws-fx-field__num')[0];
    expect(count?.attributes('aria-label')).toBe('Particle count');
    await count?.setValue('5000');
    await count?.trigger('change');
    expect(layer().content.params).toMatchObject({ count: 5000 });
    expect(layer().content.preset).toBeUndefined();
    await count?.setValue('999999');
    await count?.trigger('change');
    expect(layer().content.params).toMatchObject({ count: 200000 });
    await count?.setValue('abc');
    await count?.trigger('change');
    expect(layer().content.params).toMatchObject({ count: 200000 });
    const slider = wrapper.findAllComponents(QSlider)[0];
    await slider?.vm.$emit('update:modelValue', 1234);
    expect(layer().content.params).toMatchObject({ count: 1234 });
  });

  it('renders every kind of control and writes enum, toggle, colour and vector edits', async () => {
    const { wrapper, layer, editor } = await setup();
    // Switch to the image preset so that the image group and the interaction group matter.
    await wrapper
      .findAllComponents(QBtn)
      .find((b) => b.props('label') === 'Magnetic canvas')
      ?.trigger('click');
    await flushPromises();
    const text = wrapper.text();
    for (const title of [
      'Particle count',
      'Spawn',
      'Appearance',
      'Camera',
      'Pointer',
      'Image',
      'Forces and behaviour',
    ])
      expect(text).toContain(title);
    // Enum: the pointer effect select.
    const select = wrapper
      .findAllComponents(QSelect)
      .find((s) => s.props('label') === 'Pointer effect');
    expect(select).toBeDefined();
    await select?.vm.$emit('update:modelValue', 'repel');
    expect(layer().content.params).toMatchObject({ interaction: { mode: 'repel' } });
    // Toggle: "Rebuild the image from particles".
    const toggle = wrapper
      .findAllComponents(QToggle)
      .find((t) => t.props('label') === 'Rebuild the image from particles');
    await toggle?.vm.$emit('update:modelValue', false);
    expect(layer().content.params).toMatchObject({ image: { enabled: false } });
    // Colour: native colour input of "Colour".
    const colour = wrapper.find('input[type="color"][aria-label="Colour"]');
    await colour.setValue('#ff0000');
    expect(layer().content.params).toMatchObject({ appearance: { color: '#ff0000' } });
    // Vector: spawn position x.
    const x = wrapper.find('input[aria-label="Position (x, y, z) x"]');
    await x.setValue('1,5');
    await x.trigger('change');
    expect(layer().content.params).toMatchObject({ spawn: { position: [1.5, 0, 0] } });
    await x.setValue('9999');
    await x.trigger('change');
    expect(layer().content.params).toMatchObject({ spawn: { position: [50, 0, 0] } });
    expect(editor.issues).toEqual([]);
  });

  it('edits the forces list: preset forces are shown, new ones come from the unused types, order and removal work', async () => {
    const { wrapper, layer } = await setup();
    const forces = () =>
      (layer().content.params.operators as Array<{ type: string }> | undefined)?.map((o) => o.type);
    expect(forces()).toEqual(['spring-home', 'vortex', 'drag']);
    expect(wrapper.text()).toContain('Return to origin');
    await wrapper.find('button.q-btn-dropdown').trigger('click');
    await flushPromises();
    const items = [...document.body.querySelectorAll('.q-menu .q-item')].map((el) =>
      el.textContent?.trim(),
    );
    expect(items).toEqual(['Flow field', 'Gravity wells', 'Speed limit', 'Boundary']);
    (document.body.querySelectorAll('.q-menu .q-item')[0] as HTMLElement).click();
    await flushPromises();
    expect(forces()).toEqual(['spring-home', 'vortex', 'drag', 'flow-field']);
    expect((layer().content.params.operators as Array<Record<string, unknown>>)[3]).toMatchObject({
      type: 'flow-field',
      frequency: 0.8,
      amplitude: 1,
      speed: 0.3,
    });
    const move = (label: string, index: number) =>
      wrapper.findAll(`button[aria-label="${label}"]`)[index]?.trigger('click');
    await move('Move down', 0);
    expect(forces()).toEqual(['vortex', 'spring-home', 'drag', 'flow-field']);
    await move('Move up', 3);
    expect(forces()).toEqual(['vortex', 'spring-home', 'flow-field', 'drag']);
    await wrapper
      .findAll('button[aria-label="Remove"]')
      .find((b) => b.element.closest('.sws-fx-field__item'))
      ?.trigger('click');
    expect(forces()).toEqual(['spring-home', 'flow-field', 'drag']);
  });

  it('adds gravity wells and palette colours up to their limits', async () => {
    const { wrapper, layer } = await setup();
    await wrapper.find('button.q-btn-dropdown').trigger('click');
    await flushPromises();
    [...document.body.querySelectorAll('.q-menu .q-item')]
      .find((el) => el.textContent?.includes('Gravity wells'))
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const wellsAt = () =>
      (layer().content.params.operators as Array<{ type: string; wells?: unknown[] }>).find(
        (o) => o.type === 'gravity-wells',
      )?.wells;
    expect(wellsAt()).toEqual([]);
    const addWell = () =>
      wrapper.findAllComponents(QBtn).filter((b) => b.props('label') === 'Add')[0];
    for (let i = 0; i < 4; i++) {
      await addWell()?.trigger('click');
      await flushPromises();
    }
    expect(wellsAt()).toHaveLength(3);
    expect(wellsAt()?.[0]).toEqual({ position: [0, 0, 0], mass: 1 });
    expect(addWell()?.props('disable')).toBe(true);
  });

  it('resets a group to its defaults and keeps the others', async () => {
    const { wrapper, layer } = await setup();
    await wrapper
      .findAll('.sws-acc__toggle')
      .find((t) => t.text().includes('Camera'))
      ?.trigger('click');
    const reset = wrapper
      .findAllComponents(QBtn)
      .filter((b) => b.props('label') === 'Reset to defaults');
    expect(layer().content.params).toHaveProperty('camera');
    await reset
      .find((b) => b.element.closest('section')?.textContent?.includes('Camera'))
      ?.trigger('click');
    expect(layer().content.params).not.toHaveProperty('camera');
    expect(layer().content.params).toHaveProperty('appearance');
  });

  it('sets the seed (valid numbers only), draws a new one, changes the quality and fires the impulse', async () => {
    const { wrapper, layer } = await setup();
    const seed = wrapper.findAllComponents(QInput).find((i) => i.props('label') === 'Seed');
    await seed?.vm.$emit('update:modelValue', '42');
    expect(layer().content.seed).toBe(42);
    await seed?.vm.$emit('update:modelValue', '-5');
    await seed?.vm.$emit('update:modelValue', 'abc');
    await seed?.vm.$emit('update:modelValue', '');
    expect(layer().content.seed).toBe(42);
    await wrapper.find('button[aria-label="New random seed"]').trigger('click');
    expect(layer().content.seed).not.toBe(42);
    expect(layer().content.seed).toBeGreaterThan(0);
    await wrapper
      .findAllComponents(QSelect)
      .find((s) => s.props('label') === 'Quality')
      ?.vm.$emit('update:modelValue', 'low');
    expect(layer().content.quality).toBe('low');
    const seen: string[] = [];
    const off = onEffectEvent((id, event) => seen.push(`${id}:${event.type}`));
    await wrapper
      .findAllComponents(QBtn)
      .find((b) => b.props('label') === 'Trigger impulse')
      ?.trigger('click');
    off();
    expect(seen).toEqual([`${layer().id}:burst`]);
  });

  it('picks the picture and the static image from the media library and removes the picture again', async () => {
    const { wrapper, layer, editor } = await setup();
    picker.pickImage.mockResolvedValue({ id: 55, url: '/u/55.jpg', alt: 'A lake', sizes: {} });
    const choose = () =>
      wrapper
        .findAllComponents(QBtn)
        .filter((b) => b.props('label') === 'Choose image' || b.props('label') === 'Replace image');
    await choose()[0]?.trigger('click');
    await flushPromises();
    expect(layer().content.assets).toEqual({ image: 55 });
    expect(layer().content.fallbackImageId).toBe(55);
    expect(layer().content.alt).toBe('A lake');
    expect(editor.media[55]?.url).toBe('/u/55.jpg');
    picker.pickImage.mockResolvedValue({ id: 66, url: '/u/66.jpg', alt: '' });
    await choose()[1]?.trigger('click');
    await flushPromises();
    expect(layer().content.fallbackImageId).toBe(66);
    expect(layer().content.alt).toBe('A lake');
    picker.pickImage.mockResolvedValue(null);
    await choose()[0]?.trigger('click');
    await flushPromises();
    expect(layer().content.assets).toEqual({ image: 55 });
    await wrapper
      .findAllComponents(QBtn)
      .find((b) => b.props('label') === 'Remove image')
      ?.trigger('click');
    expect(layer().content.assets).toEqual({});
  });

  it('warns about unknown effects, outdated parameter versions and invalid parameters', async () => {
    const { wrapper, layer, editor } = await setup();
    editor.updateLayer(layer().id, (l) => {
      if (l.type === 'effect') l.content.schemaVersion = 0 + 1;
    });
    // Unknown type: only the notice and the media section remain.
    editor.updateLayer(layer().id, (l) => {
      if (l.type === 'effect') l.content.effect = 'gone/plugin';
    });
    await flushPromises();
    expect(wrapper.text()).toContain('The effect "gone/plugin" is not available');
    expect(wrapper.text()).not.toContain('Particle count');
    expect(wrapper.text()).toContain('Media');
    editor.updateLayer(layer().id, (l) => {
      if (l.type === 'effect') {
        l.content.effect = 'particle-field';
        l.content.params = { count: 0 };
      }
    });
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    first().schemaVersion = 2;
    editor.updateLayer(layer().id, (l) => {
      if (l.type === 'effect') l.content.params = { count: 100 };
    });
    await flushPromises();
    expect(wrapper.text()).toContain('saved for another version');
    expect(wrapper.text()).not.toContain('Particle count');
    await wrapper
      .findAllComponents(QBtn)
      .find((b) => b.props('label') === 'Use current version')
      ?.trigger('click');
    expect(layer().content.schemaVersion).toBe(2);
    first().schemaVersion = 1;
  });

  it("offers a type switch only with several registered effects and restarts from the new type's first preset", async () => {
    const other = {
      ...first(),
      type: 'acme/glow',
      label: 'Glow',
      presets: [{ id: 'soft', name: 'Soft', description: '', seed: 0, params: { count: 10 } }],
      builtin: false,
    };
    effects.push(other as never);
    try {
      const { wrapper, layer } = await setup();
      const select = wrapper
        .findAllComponents(QSelect)
        .find((s) => s.props('label') === 'Effect type');
      expect(select).toBeDefined();
      await select?.vm.$emit('update:modelValue', 'acme/glow');
      expect(layer().content).toMatchObject({
        effect: 'acme/glow',
        preset: 'soft',
        params: { count: 10 },
        assets: {},
      });
      expect(layer().content.seed).toBeGreaterThan(0);
      await select?.vm.$emit('update:modelValue', 'acme/glow');
    } finally {
      effects.pop();
    }
  });
});
