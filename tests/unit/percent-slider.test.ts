import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { Quasar, QSlider } from 'quasar';
import PercentSlider from '@editor/components/fields/PercentSlider.vue';

function make(value = 40) {
  return mount(PercentSlider, {
    props: { modelValue: value, label: 'Opacity' },
    global: { plugins: [Quasar] },
  });
}

describe('PercentSlider', () => {
  it('shows the live value while dragging but commits only on release', async () => {
    const wrapper = make();
    const slider = wrapper.findComponent(QSlider);
    expect(wrapper.text()).toContain('40 %');
    await slider.vm.$emit('update:modelValue', 65);
    expect(wrapper.text()).toContain('65 %');
    expect(wrapper.emitted('commit')).toBeUndefined();
    await slider.vm.$emit('change', 65);
    expect(wrapper.emitted('commit')).toEqual([[65]]);
  });
  it('ignores unchanged and empty releases and follows external value changes', async () => {
    const wrapper = make();
    const slider = wrapper.findComponent(QSlider);
    await slider.vm.$emit('change', 40);
    await slider.vm.$emit('change', null);
    expect(wrapper.emitted('commit')).toBeUndefined();
    await wrapper.setProps({ modelValue: 10 });
    expect(wrapper.text()).toContain('10 %');
  });
});
