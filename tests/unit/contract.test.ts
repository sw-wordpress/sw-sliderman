import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalBytes } from '@shared/canonical';
import { LIMITS } from '@shared/limits';
import { collectIssues, validateDocument } from '@shared/validate';
import {
  breakpointForWidth,
  resolveLayer,
  resolveLayerLayout,
  resolveLayerStyle,
} from '@shared/layout';
import { layerDeclarations, serializeDeclarations, formatNumber } from '@shared/css';
import { effectiveSlideDurationMs, scheduleSlide } from '@shared/schedule';
import type { BreakpointName, Layer, SliderDocument } from '@shared/types';
import { ROOT, fixture, fixtureFiles, patch, type PatchOp } from './fixtures';

interface InvalidCase {
  name: string;
  base: string;
  ops: PatchOp[];
  issues: Array<{ path: string; code: string }>;
}

function basic(): SliderDocument {
  const result = validateDocument(fixture('documents/valid/basic.json'));
  if (!result.ok) throw new Error('basic fixture must be valid');
  return result.document;
}

function layersById(document: SliderDocument): Map<string, Layer> {
  return new Map(document.slides.flatMap((slide) => slide.layers.map((l) => [l.id, l] as const)));
}

describe('document validator contract', () => {
  it.each(fixtureFiles('documents/valid'))('valid fixture %s has no issues', (file) => {
    expect(collectIssues(fixture(`documents/valid/${file}`))).toEqual([]);
  });

  it('default template is valid', () => {
    const template = JSON.parse(
      readFileSync(resolve(ROOT, 'schemas/defaults/new-slider.json'), 'utf8'),
    );
    expect(collectIssues(template)).toEqual([]);
  });

  const suite = fixture('documents/invalid.json') as { cases: InvalidCase[] };
  it.each(suite.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const document = patch(fixture(`documents/valid/${c.base}.json`), c.ops);
    const actual = collectIssues(document)
      .map((i) => `${i.path} ${i.code}`)
      .sort();
    const expected = c.issues.map((i) => `${i.path} ${i.code}`).sort();
    expect(actual).toEqual(expected);
  });

  it('limits mirror the PHP constants', () => {
    const php = readFileSync(resolve(ROOT, 'src/Domain/Limits.php'), 'utf8');
    const constants = new Map(
      [...php.matchAll(/const ([A-Z_]+)\s*=\s*(-?[0-9.]+);/g)].map((m) => [m[1], Number(m[2])]),
    );
    const typescript = new Map(
      Object.entries(LIMITS).map(([key, value]) => [
        key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase(),
        value,
      ]),
    );
    expect(Object.fromEntries(typescript)).toEqual(Object.fromEntries(constants));
  });
});

describe('canonical document size', () => {
  const data = fixture('documents/size.json') as {
    cases: Array<{ name: string; text: string; repeat: number; layers: number; tooLarge: boolean }>;
  };
  const samples = fixture('documents/size.json') as {
    samples: Array<{ value: unknown; bytes: number }>;
  };
  it.each(samples.samples)('matches PHP canonical bytes for $value', (sample) => {
    expect(canonicalBytes(sample.value)).toBe(sample.bytes);
  });
  it.each(data.cases)('$name', (item) => {
    const doc = JSON.parse(JSON.stringify(basic()));
    const layer = doc.slides[0].layers[0];
    doc.slides = [doc.slides[0]];
    doc.slides[0].layers = Array.from({ length: item.layers }, (_, index) => ({
      ...structuredClone(layer),
      id: `layer-${index}`,
      content: { ...layer.content, text: item.text.repeat(item.repeat) },
    }));
    expect(canonicalBytes(doc) > LIMITS.documentBytes).toBe(item.tooLarge);
    expect(collectIssues(doc)).toEqual(item.tooLarge ? [{ path: '', code: 'too_large' }] : []);
  });
});

describe('layout and css contract', () => {
  const golden = fixture('css/basic.json') as {
    cases: Array<{
      breakpoint: BreakpointName;
      layer: string;
      box: Record<string, number>;
      boxCss: string;
      bodyCss: string;
    }>;
  };

  it.each(golden.cases.map((c) => [`${c.breakpoint}/${c.layer}`, c] as const))(
    '%s',
    (_label, c) => {
      const document = basic();
      const layer = layersById(document).get(c.layer);
      if (!layer) throw new Error(`missing layer ${c.layer}`);
      const stage = document.breakpoints[c.breakpoint];
      const resolved = resolveLayer(layer, c.breakpoint, document.breakpoints);
      for (const [key, value] of Object.entries(c.box)) {
        expect(resolved.box[key as keyof typeof resolved.box]).toBeCloseTo(value, 9);
      }
      const css = layerDeclarations(
        resolved,
        stage.stageWidth,
        stage.stageHeight,
        document.fontRefs,
      );
      expect(serializeDeclarations(css.box)).toBe(c.boxCss);
      expect(serializeDeclarations(css.body)).toBe(c.bodyCss);
    },
  );

  it('inherits desktop -> tablet -> mobile per property', () => {
    const layer = layersById(basic()).get('headline');
    if (!layer) throw new Error('missing headline');
    expect(resolveLayerStyle(layer, 'desktop').fontSize).toBe(64);
    expect(resolveLayerStyle(layer, 'tablet').fontSize).toBe(48);
    expect(resolveLayerStyle(layer, 'mobile').fontSize).toBe(34);
    expect(resolveLayerStyle(layer, 'tablet').textAlign).toBe('left');
    expect(resolveLayerLayout(layer, 'mobile').height).toBe(140);
    expect(resolveLayerLayout(layer, 'tablet').x).toBe(100);
  });

  it('chooses the breakpoint from the container width', () => {
    const { breakpoints } = basic();
    expect(breakpointForWidth(breakpoints, 767.9)).toBe('mobile');
    expect(breakpointForWidth(breakpoints, 768)).toBe('tablet');
    expect(breakpointForWidth(breakpoints, 1023)).toBe('tablet');
    expect(breakpointForWidth(breakpoints, 1024)).toBe('desktop');
  });

  it('formats numbers like the PHP serializer', () => {
    expect(formatNumber(-0.00001)).toBe('0');
    expect(formatNumber(-0.00005)).toBe('-0.0001');
    expect(formatNumber(12.5)).toBe('12.5');
    expect(formatNumber(100)).toBe('100');
    expect(formatNumber(1 / 3)).toBe('0.3333');
  });
});

describe('schedule contract', () => {
  it('extends slides to the end of their animations', () => {
    const document = basic();
    const expected = fixture('schedule/basic.json') as {
      slides: Array<{ id: string; effectiveDurationMs: number; extended: boolean }>;
    };
    expected.slides.forEach((slide, index) => {
      const actual = document.slides[index];
      if (!actual) throw new Error('missing slide');
      expect(effectiveSlideDurationMs(actual)).toBe(slide.effectiveDurationMs);
      expect(scheduleSlide(actual).extended).toBe(slide.extended);
    });
  });
});
