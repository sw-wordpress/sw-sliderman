import { describe, expect, it } from 'vitest';
import { LIMITS } from '@shared/limits';
import { collectIssues } from '@shared/validate';
import type { RichParagraph } from '@shared/types';
import { clampRich, docToRich, richToDoc, sameRich, textToRich } from '@editor/document/richtext';
import { htmlToRich } from '@editor/features/editor/richExtensions';

const sample: RichParagraph[] = [
  {
    runs: [
      { text: 'Hallo ', bold: true },
      {
        text: 'Welt\nzweite Zeile',
        italic: true,
        link: { url: 'https://example.com', newTab: true },
      },
    ],
  },
  { runs: [] },
  { runs: [{ text: 'intern', link: { url: '/kontakt' } }] },
];

function text(rich: RichParagraph[]): string {
  return rich.map((p) => p.runs.map((r) => r.text).join('')).join('|');
}

describe('rich text conversion', () => {
  it('round-trips the model through the editor document', () => {
    expect(docToRich(richToDoc(sample))).toEqual(sample);
  });
  it('turns legacy plain text into one paragraph per line', () => {
    expect(textToRich('a\n\nb')).toEqual([
      { runs: [{ text: 'a' }] },
      { runs: [] },
      { runs: [{ text: 'b' }] },
    ]);
    expect(textToRich('')).toEqual([{ runs: [] }]);
  });
  it('merges equally formatted neighbours and drops unknown nodes, marks and unsafe links', () => {
    const rich = docToRich({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'c', marks: [{ type: 'underline' }] },
            {
              type: 'text',
              text: 'd',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
            { type: 'image', attrs: { src: 'x' } },
          ],
        },
      ],
    });
    expect(rich).toEqual([{ runs: [{ text: 'ab', bold: true }, { text: 'cd' }] }]);
  });
  it('clamps to the document limits and always yields a valid model', () => {
    const many = Array.from({ length: LIMITS.richParagraphs + 5 }, () => ({
      runs: [{ text: 'x' }],
    }));
    expect(clampRich(many)).toHaveLength(LIMITS.richParagraphs);
    const alternating = Array.from({ length: LIMITS.richRunsPerParagraph + 20 }, (_, i) => ({
      text: 'x',
      bold: i % 2 === 0,
    }));
    const clamped = clampRich([{ runs: alternating }]);
    expect(clamped[0]?.runs).toHaveLength(LIMITS.richRunsPerParagraph);
    expect(clamped[0]?.runs.map((r) => r.text).join('')).toHaveLength(alternating.length);
    const long = clampRich([{ runs: [{ text: 'y'.repeat(LIMITS.textLength + 50) }] }]);
    expect(long[0]?.runs[0]?.text).toHaveLength(LIMITS.textLength);
    expect(clampRich([])).toEqual([{ runs: [] }]);
  });
  it('compares models structurally', () => {
    expect(sameRich(sample, structuredClone(sample))).toBe(true);
    expect(sameRich(sample, textToRich('x'))).toBe(false);
  });
});

describe('pasted HTML is converted, never stored', () => {
  it('keeps paragraphs, breaks, bold, italic and safe links', () => {
    const rich = htmlToRich(
      '<p>Eins <b>fett</b> und <i>schräg</i><br>neu</p><div>Zwei <a href="https://example.com/x" target="_blank">Link</a></div><ul><li>a</li><li>b</li></ul>',
    );
    expect(text(rich)).toBe('Eins fett und schräg\nneu|Zwei Link|a|b');
    expect(rich[0]?.runs[1]).toEqual({ text: 'fett', bold: true });
    expect(rich[1]?.runs[1]).toEqual({ text: 'Link', link: { url: 'https://example.com/x' } });
  });
  it('drops scripts, styles, attributes, handlers and unsafe or relative-host links', () => {
    const rich = htmlToRich(
      '<p style="color:red" onclick="x()">A<script>alert(1)</script><style>p{}</style><img src=x onerror="alert(2)"><iframe src="//evil"></iframe></p>' +
        '<p><a href="javascript:alert(3)">js</a> <a href="//evil.example">proto</a> <a href="data:text/html,x">data</a> <a href=" JAVASCRIPT:alert(4)">ws</a> <a href="https://ok.example/p?a=1">ok</a></p>' +
        '<h1 class="x" id="y"><span style="font-weight:700">Titel</span></h1>',
    );
    const serialized = JSON.stringify(rich);
    expect(serialized).not.toMatch(/script|onclick|onerror|iframe|style|javascript|evil|data:/i);
    expect(text(rich)).toContain('A');
    expect(text(rich)).toContain('Titel');
    const links = rich.flatMap((p) => p.runs).filter((r) => r.link);
    expect(links.map((r) => r.link?.url)).toEqual(['https://ok.example/p?a=1']);
  });
  it('produces models that satisfy the document validator', () => {
    const rich = htmlToRich('<p><strong>x</strong><a href="mailto:a@example.com">m</a></p><p></p>');
    const issues = collectIssues({
      content: { text: '', tag: 'p', rich },
    });
    expect(issues.some((i) => i.path.includes('/rich'))).toBe(false);
  });
  it('returns an empty paragraph for input without text', () => {
    expect(htmlToRich('<script>x</script>')).toEqual([{ runs: [] }]);
    expect(htmlToRich('')).toEqual([{ runs: [] }]);
  });
});
