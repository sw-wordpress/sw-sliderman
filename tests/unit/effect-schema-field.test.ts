import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, provide, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { Quasar, QSelect } from 'quasar';

vi.mock('@editor/config', () => ({
  getConfig: () => ({ siteId: 1, userId: 1, locale: 'en_US', capabilities: [], effects: [] }),
  can: () => true,
}));
const { default: SchemaField } = await import('@editor/features/effects/SchemaField.vue');
const { EFFECT_FORM } = await import('@editor/features/effects/formKey');

const schema = {
  type: 'array',
  maxItems: 3,
  title: 'Parts',
  items: {
    discriminator: 'kind',
    oneOf: [
      {
        type: 'object',
        title: 'Glow',
        properties: {
          kind: { type: 'string', const: 'glow' },
          power: { type: 'number', minimum: 0, maximum: 10, default: 1, title: 'Power' },
        },
      },
    ],
  },
};

afterEach(() => {
  document.body.innerHTML = '';
});

function mountField(fieldSchema: Record<string, unknown>, initial: unknown) {
  const values = ref<Record<string, unknown>>({ parts: initial });
  const set = vi.fn();
  const Host = defineComponent({
    setup() {
      provide(EFFECT_FORM, { values, set, reset: vi.fn(), begin: vi.fn(), end: vi.fn() });
      return () => h(SchemaField, { schema: fieldSchema, path: ['parts'], name: 'parts' });
    },
  });
  const wrapper = mount(Host, { global: { plugins: [Quasar] }, attachTo: document.body });
  return { wrapper, set };
}

describe('SchemaField lists of plain values', () => {
  it('renders an editable control for every scalar entry', () => {
    const { wrapper } = mountField(
      {
        type: 'array',
        maxItems: 4,
        title: 'Weights',
        items: { type: 'number', minimum: 0, maximum: 10, default: 1 },
      },
      [2, 5],
    );
    expect(wrapper.findAll('input').length).toBeGreaterThanOrEqual(2);
    wrapper.unmount();
  });
});

describe('SchemaField object lists with an ordinary type property', () => {
  it('keeps the type field editable when the items are not discriminated variants', () => {
    const { wrapper } = mountField(
      {
        type: 'array',
        maxItems: 3,
        title: 'Marks',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['circle', 'square'], default: 'circle', title: 'Shape' },
          },
        },
      },
      [{ type: 'square' }],
    );
    expect(wrapper.text()).toContain('Shape');
    wrapper.unmount();
  });
});

describe('SchemaField numeric enums', () => {
  it('renders a select that keeps the numeric option values', () => {
    const values = ref<Record<string, unknown>>({ parts: 2 });
    const set = vi.fn();
    const Host = defineComponent({
      setup() {
        provide(EFFECT_FORM, { values, set, reset: vi.fn(), begin: vi.fn(), end: vi.fn() });
        return () =>
          h(SchemaField, {
            schema: { type: 'integer', minimum: 1, maximum: 4, enum: [1, 2, 4], default: 1 },
            path: ['parts'],
            name: 'parts',
          });
      },
    });
    const wrapper = mount(Host, { global: { plugins: [Quasar] }, attachTo: document.body });
    const select = wrapper.findComponent(QSelect);
    expect(select.exists()).toBe(true);
    expect(select.props('modelValue')).toBe(2);
    expect((select.props('options') as Array<{ value: unknown }>).map((o) => o.value)).toEqual([
      1, 2, 4,
    ]);
    select.vm.$emit('update:model-value', 4);
    expect(set).toHaveBeenCalledWith(['parts'], 4);
    wrapper.unmount();
  });
});

describe('SchemaField minItems', () => {
  const numbers = { type: 'number', minimum: 0, maximum: 10, default: 1 };
  const removeButtons = (wrapper: ReturnType<typeof mountField>['wrapper']) =>
    wrapper.findAll('button[aria-label="Remove"]');

  it('does not offer removing entries below the declared minimum', async () => {
    const { wrapper, set } = mountField(
      { type: 'array', minItems: 1, maxItems: 3, title: 'Weights', items: numbers },
      [4],
    );
    const [only] = removeButtons(wrapper);
    expect(only?.attributes('disabled')).toBeDefined();
    await only?.trigger('click');
    expect(set).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('removes entries again above the minimum, also for colour lists', async () => {
    const { wrapper, set } = mountField(
      { type: 'array', minItems: 1, maxItems: 3, title: 'Weights', items: numbers },
      [4, 5],
    );
    const [first] = removeButtons(wrapper);
    expect(first?.attributes('disabled')).toBeUndefined();
    await first?.trigger('click');
    expect(set).toHaveBeenCalledWith(['parts'], [5]);
    wrapper.unmount();
    const colours = mountField(
      {
        type: 'array',
        minItems: 2,
        maxItems: 4,
        title: 'Colours',
        items: { type: 'string', format: 'color' },
      },
      ['#ff0000', '#00ff00'],
    );
    expect(colours.wrapper.findAll('.sws-fx-field__x')).toHaveLength(0);
    colours.wrapper.unmount();
  });
});

describe('SchemaField with a custom discriminator', () => {
  it('shows the fields of an item and tracks used variants by the declared discriminator', () => {
    const values = ref<Record<string, unknown>>({ parts: [{ kind: 'glow', power: 3 }] });
    const Host = defineComponent({
      setup() {
        provide(EFFECT_FORM, {
          values,
          set: vi.fn(),
          reset: vi.fn(),
          begin: vi.fn(),
          end: vi.fn(),
        });
        return () => h(SchemaField, { schema, path: ['parts'], name: 'parts' });
      },
    });
    const wrapper = mount(Host, { global: { plugins: [Quasar] }, attachTo: document.body });
    const text = wrapper.text();
    expect(text).toContain('Power');
    // The discriminator itself is not offered as an editable field.
    expect(text).not.toContain('Kind');
    wrapper.unmount();
  });
});
