import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { Quasar } from 'quasar';
import AccordionSection from '@editor/components/AccordionSection.vue';
import { isSectionOpen, resetSections, setAllSections } from '@editor/composables/useAccordion';

function make(defaultOpen = false, id = 'test.a') {
  return mount(AccordionSection, {
    props: { id, title: 'Box', defaultOpen },
    slots: { default: '<p class="inner">Body</p>', summary: '0 px · 100 %' },
    global: { plugins: [Quasar] },
  });
}

describe('AccordionSection', () => {
  beforeEach(resetSections);

  it('starts collapsed, shows the summary and toggles with aria-expanded', async () => {
    const wrapper = make();
    const button = wrapper.get('button');
    expect(button.attributes('aria-expanded')).toBe('false');
    expect(wrapper.text()).toContain('0 px · 100 %');
    expect(wrapper.get('.sws-acc__body').attributes('style')).toContain('display: none');
    await button.trigger('click');
    expect(button.attributes('aria-expanded')).toBe('true');
    expect(wrapper.text()).not.toContain('0 px · 100 %');
    expect(wrapper.get('.sws-acc__body').attributes('style') ?? '').not.toContain('display: none');
  });

  it('keeps the open state per id and follows collapse/expand all', async () => {
    const wrapper = make(true);
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true');
    setAllSections(false, ['test.a', 'test.b']);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('false');
    expect(isSectionOpen('test.b', true)).toBe(false);
    expect(isSectionOpen('test.unknown', true)).toBe(true);
    expect(make(false, 'test.a').get('button').attributes('aria-expanded')).toBe('false');
  });
});
