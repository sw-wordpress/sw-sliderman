import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, provide, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { Quasar } from 'quasar';

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
