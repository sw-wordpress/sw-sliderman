import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { diagnose } from '@shared/diagnostics';
import { buttonStateCss } from '@shared/css';
import { validateDocument } from '@shared/validate';
import { previewInfo } from '@editor/utils/preview';
import { useTabGuard } from '@editor/composables/useTabGuard';
import { mutable } from '@editor/document/ops';
import { nextMeasurement } from '@editor/utils/measure';
import { fixture } from './fixtures';

function basic() {
  const result = validateDocument(fixture('documents/valid/basic.json'));
  if (!result.ok) throw new Error('fixture');
  return result.document;
}

describe('layout diagnostics', () => {
  it('reports nothing for the reference document', () => {
    expect(diagnose(basic()).filter((d) => d.code === 'overflow')).toEqual([]);
  });
  it('finds overflowing layers per breakpoint and ignores hidden ones', () => {
    const doc = mutable(basic());
    const layer = doc.slides[0]?.layers[0];
    if (!layer) throw new Error('layer');
    layer.overrides = { mobile: { layout: { x: 5000 } } };
    const hits = diagnose(doc).filter((d) => d.code === 'overflow');
    expect(hits.map((d) => d.breakpoint)).toEqual(['mobile']);
    layer.overrides = { mobile: { layout: { x: 5000, visible: false } } };
    expect(diagnose(doc).filter((d) => d.code === 'overflow')).toEqual([]);
  });
  it('warns when text renders too small on narrow screens', () => {
    const doc = mutable(basic());
    const layer = doc.slides[0]?.layers.find((l) => l.type !== 'image');
    if (!layer) throw new Error('layer');
    layer.style.fontSize = 8;
    const small = diagnose(doc).filter((d) => d.code === 'small_font');
    expect(small.length).toBeGreaterThan(0);
    expect(small[0]?.value).toBeLessThan(12);
  });
});

describe('shapes and button states', () => {
  it('ignores shapes in text diagnostics', () => {
    const doc = mutable(basic());
    const shape = doc.slides[1]?.layers.find((l) => l.type === 'shape');
    if (!shape) throw new Error('shape fixture');
    shape.style.fontSize = 6;
    expect(diagnose(doc).filter((d) => d.layerId === shape.id && d.code === 'small_font')).toEqual(
      [],
    );
  });
  it('emits only the state rules that were set', () => {
    const base = { label: 'A', url: '#', newTab: false };
    expect(buttonStateCss('.x', base)).toBe('');
    expect(buttonStateCss('.x', { ...base, focusOutlineColor: '#ABCDEF' })).toBe(
      '.x .sws-button:focus-visible{outline:3px solid #abcdef;outline-offset:3px;}',
    );
    expect(buttonStateCss('.x', { ...base, hoverColor: '#FFFFFF' })).toBe(
      '.x .sws-layer__body:hover{color:#ffffff;}.x .sws-button:hover{filter:none;}',
    );
  });
});

describe('preview width', () => {
  it('derives breakpoint, scale and rendered text size from a container width', () => {
    const { breakpoints } = basic();
    const wide = previewInfo(breakpoints, breakpoints.desktop.minWidth, 20);
    expect(wide.breakpoint).toBe('desktop');
    const narrow = previewInfo(breakpoints, 10, 20);
    expect(narrow.width).toBe(200);
    expect(narrow.breakpoint).toBe('mobile');
    expect(narrow.renderedFontSize).toBeCloseTo(20 * (200 / breakpoints.mobile.stageWidth), 1);
  });
});

describe('tab guard', () => {
  function bus() {
    const channels: Array<{ onmessage: ((e: MessageEvent) => void) | null; owner: object }> = [];
    return (): BroadcastChannel => {
      const owner = {};
      const channel = {
        onmessage: null as ((e: MessageEvent) => void) | null,
        owner,
        postMessage(data: unknown) {
          channels
            .filter((c) => c.owner !== owner)
            .forEach((c) => c.onmessage?.({ data } as MessageEvent));
        },
        close: vi.fn(),
      };
      channels.push(channel);
      return channel as unknown as BroadcastChannel;
    };
  }
  it('counts other tabs of the same slider and forgets them when they leave', async () => {
    const make = bus();
    const first = ref<number | null>(7);
    const a = useTabGuard(first, 1, make);
    expect(a.otherTabs.value).toBe(0);
    const second = ref<number | null>(7);
    const b = useTabGuard(second, 1, make);
    await nextTick();
    expect(a.otherTabs.value).toBe(1);
    expect(b.otherTabs.value).toBe(1);
    second.value = 8; // other slider: previous tab says bye
    await nextTick();
    expect(a.otherTabs.value).toBe(0);
    // A tab that is closed (pagehide) is dropped at once.
    const third = ref<number | null>(7);
    useTabGuard(third, 1, make);
    await nextTick();
    expect(a.otherTabs.value).toBe(1);
    window.dispatchEvent(new Event('pagehide'));
    await nextTick();
    expect(a.otherTabs.value).toBe(0);
    const solo = useTabGuard(ref<number | null>(3), 1, () => null);
    expect(solo.otherTabs.value).toBe(0);
  });
});

describe('stage measurement', () => {
  it('ignores sub-pixel jitter and invalid values, accepts real changes', () => {
    expect(nextMeasurement(800, 800.6)).toBe(800);
    expect(nextMeasurement(800, 799)).toBe(800);
    expect(nextMeasurement(800, 802)).toBe(802);
    expect(nextMeasurement(800, undefined)).toBe(800);
    expect(nextMeasurement(800, Number.NaN)).toBe(800);
  });
});
