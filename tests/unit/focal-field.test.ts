import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { Quasar } from 'quasar';
import FocalPointField from '@editor/components/fields/FocalPointField.vue';

function mountField(props: { src: string | null; x: number; y: number }) {
  return mount(FocalPointField, { props, global: { plugins: [Quasar] }, attachTo: document.body });
}
function stubRect(el: Element): void {
  el.getBoundingClientRect = () =>
    ({
      left: 10,
      top: 20,
      width: 200,
      height: 100,
      right: 210,
      bottom: 120,
      x: 10,
      y: 20,
      toJSON() {},
    }) as DOMRect;
}
function pointer(type: string, x: number, y: number): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.assign(event, { clientX: x, clientY: y, pointerId: 1 });
  return event;
}

describe('focal point field', () => {
  it('commits once per drag, with clamped percent values', async () => {
    const wrapper = mountField({ src: '/a.jpg', x: 50, y: 50 });
    const frame = wrapper.find('.sws-focal__frame').element;
    stubRect(frame);
    const hit = wrapper.find('[data-testid="focal-hit"]').element as HTMLElement;
    hit.setPointerCapture = () => undefined;
    hit.dispatchEvent(pointer('pointerdown', 110, 70)); // 50 % / 50 % -> unchanged
    hit.dispatchEvent(pointer('pointermove', 60, 45)); // 25 % / 25 %
    expect(wrapper.emitted('commit')).toBeUndefined(); // nothing while dragging
    hit.dispatchEvent(pointer('pointermove', 500, -50)); // clamped to 100 % / 0 %
    hit.dispatchEvent(pointer('pointerup', 500, -50));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('commit')).toEqual([[{ x: 100, y: 0 }]]);
    wrapper.unmount();
  });

  it('does not commit an unchanged point, ignores cancelled drags and works without a preview', async () => {
    const wrapper = mountField({ src: '/a.jpg', x: 50, y: 50 });
    stubRect(wrapper.find('.sws-focal__frame').element);
    const hit = wrapper.find('[data-testid="focal-hit"]').element as HTMLElement;
    hit.setPointerCapture = () => undefined;
    hit.dispatchEvent(pointer('pointerdown', 110, 70));
    hit.dispatchEvent(pointer('pointerup', 110, 70));
    hit.dispatchEvent(pointer('pointerdown', 20, 30));
    hit.dispatchEvent(pointer('pointercancel', 20, 30));
    hit.dispatchEvent(pointer('pointerup', 20, 30));
    expect(wrapper.emitted('commit')).toBeUndefined();
    wrapper.unmount();
    const none = mountField({ src: null, x: 10, y: 20 });
    expect(none.find('.sws-focal__frame').exists()).toBe(false);
    none.unmount();
  });

  it('commits numeric entries for one axis at a time', async () => {
    const wrapper = mountField({ src: null, x: 10, y: 20 });
    const inputs = wrapper.findAll('input');
    await inputs[0]?.setValue('40');
    await inputs[0]?.trigger('change');
    await inputs[1]?.setValue('120'); // out of range: not committed
    await inputs[1]?.trigger('change');
    // The parent has not updated the props here, so the field may repeat the same commit.
    const commits = wrapper.emitted('commit') ?? [];
    expect(commits.length).toBeGreaterThan(0);
    expect(commits.every((c) => JSON.stringify(c) === JSON.stringify([{ x: 40, y: 20 }]))).toBe(
      true,
    );
    wrapper.unmount();
  });
});
