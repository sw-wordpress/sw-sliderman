import { describe, expect, it } from 'vitest';
import { resolveLayerLayout, resolveLayerStyle } from '@shared/layout';
import { validateDocument } from '@shared/validate';
import type { Layer, SliderDocument } from '@shared/types';
import { History } from '@editor/document/history';
import { createLayer, findLayer, layerBox, produce, resetOverride, setLayerBox, setLayoutValue, setStyleValue } from '@editor/document/ops';
import { fixture } from './fixtures';

function basic(): SliderDocument {
  const result = validateDocument(fixture('documents/valid/basic.json'));
  if (!result.ok) throw new Error('fixture invalid');
  return result.document;
}

function layer(document: SliderDocument, id: string): Layer {
  const found = document.slides.flatMap((s) => s.layers).find((l) => l.id === id);
  if (!found) throw new Error(id);
  return found;
}

describe('history', () => {
  it('records a drag as exactly one undo step', () => {
    const history = new History();
    const start = basic();
    history.beginGesture(start);
    const step1 = produce(start, (d) => setLayoutValue(findLayer(d, 'headline')!, 'desktop', 'x', 110));
    const step2 = produce(step1, (d) => setLayoutValue(findLayer(d, 'headline')!, 'desktop', 'x', 120));
    history.endGesture(step2);
    expect(history.undo(step2)).toBe(start);
    expect(history.canUndo).toBe(false);
  });

  it('cancelling a gesture returns the start state and records nothing', () => {
    const history = new History();
    const start = basic();
    history.beginGesture(start);
    expect(history.cancelGesture()).toBe(start);
    expect(history.canUndo).toBe(false);
  });

  it('a new edit after undo drops the redo branch', () => {
    const history = new History();
    const a = basic();
    const b = produce(a, (d) => (d.settings.loop = false));
    history.commit(a);
    const undone = history.undo(b);
    expect(undone).toBe(a);
    expect(history.canRedo).toBe(true);
    history.commit(a);
    expect(history.canRedo).toBe(false);
  });

  it('is bounded', () => {
    const history = new History(3);
    const doc = basic();
    for (let i = 0; i < 10; i++) history.commit(doc);
    let count = 0;
    while (history.undo(doc)) count++;
    expect(count).toBe(3);
  });
});

describe('responsive editing', () => {
  it('writes overrides only for the edited breakpoint and resets back to inheritance', () => {
    const doc = produce(basic(), (d) => {
      const target = findLayer(d, 'cta')!;
      setStyleValue(target, 'tablet', 'fontSize', 30);
      setStyleValue(target, 'tablet', 'color', '#ff0000');
    });
    const cta = layer(doc, 'cta');
    expect(resolveLayerStyle(cta, 'tablet').fontSize).toBe(30);
    expect(resolveLayerStyle(cta, 'mobile').fontSize).toBe(30);
    expect(resolveLayerStyle(cta, 'desktop').fontSize).toBe(20);
    expect(cta.style.color).toBe('#ff0000');
    expect(cta.overrides.tablet?.style).toEqual({ fontSize: 30 });
    const reset = produce(doc, (d) => resetOverride(findLayer(d, 'cta')!, 'tablet', 'style', 'fontSize'));
    expect(layer(reset, 'cta').overrides.tablet).toBeUndefined();
    expect(validateDocument(reset).ok).toBe(true);
  });

  it('converts a dragged box back into anchor-relative coordinates', () => {
    const doc = basic();
    const stage = doc.breakpoints.mobile;
    const before = layerBox(layer(doc, 'cta'), 'mobile', stage.stageWidth, stage.stageHeight);
    const moved = produce(doc, (d) =>
      setLayerBox(findLayer(d, 'cta')!, 'mobile', stage.stageWidth, stage.stageHeight, { ...before, left: before.left + 10, top: before.top - 20 }, { position: true, size: false }),
    );
    const cta = layer(moved, 'cta');
    const after = layerBox(cta, 'mobile', stage.stageWidth, stage.stageHeight);
    expect(after.left).toBeCloseTo(before.left + 10, 5);
    expect(after.top).toBeCloseTo(before.top - 20, 5);
    // anchorX centre / anchorY bottom: x and y are offsets, desktop stays untouched
    expect(resolveLayerLayout(cta, 'mobile').x).toBe(10);
    expect(resolveLayerLayout(cta, 'mobile').y).toBe(60);
    expect(resolveLayerLayout(cta, 'desktop')).toEqual(layer(doc, 'cta').layout);
  });

  it('new layers are valid document parts', () => {
    const doc = produce(basic(), (d) => {
      for (const type of ['text', 'image', 'button'] as const) {
        d.slides[0]!.layers.push(structuredClone(createLayer(type, 1440, 600, type)) as never);
      }
    });
    expect(validateDocument(doc).ok).toBe(false); // button default url 'https://' must be completed
    const fixed = produce(doc, (d) => {
      const button = d.slides[0]!.layers.at(-1)!;
      if (button.type === 'button') button.content.url = 'https://example.com';
    });
    expect(validateDocument(fixed).ok).toBe(true);
  });
});
