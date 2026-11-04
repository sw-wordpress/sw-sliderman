import { LIMITS } from '@shared/limits';
import type { RichParagraph, RichRun } from '@shared/types';
import { LINK_PATTERN } from '@shared/validate';

/**
 * Pure conversion between the stored rich text model (paragraphs of runs) and the ProseMirror
 * JSON that Tiptap edits. No editor library is imported here, so the converters stay testable and
 * out of the lazily loaded editor chunk. Only what the model can express survives a round trip:
 * bold, italic, links (policy-checked) and line breaks.
 */
export interface PmNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: PmNode[];
}

/** Plain text (legacy layers): one paragraph per line, so the editor starts from the same lines. */
export function textToRich(text: string): RichParagraph[] {
  return text.split('\n').map((line) => ({ runs: line === '' ? [] : [{ text: line }] }));
}

function sameFormat(a: RichRun, b: RichRun): boolean {
  return (
    (a.bold ?? false) === (b.bold ?? false) &&
    (a.italic ?? false) === (b.italic ?? false) &&
    a.link?.url === b.link?.url &&
    (a.link?.newTab ?? false) === (b.link?.newTab ?? false)
  );
}

function pushRun(runs: RichRun[], run: RichRun): void {
  const last = runs[runs.length - 1];
  if (last && sameFormat(last, run))
    runs[runs.length - 1] = { ...last, text: last.text + run.text };
  else runs.push(run);
}

function runOf(node: PmNode, text: string): RichRun {
  const marks = node.marks ?? [];
  const run: { text: string; bold?: true; italic?: true; link?: { url: string; newTab?: true } } = {
    text,
  };
  for (const mark of marks) {
    if (mark.type === 'bold') run.bold = true;
    else if (mark.type === 'italic') run.italic = true;
    else if (mark.type === 'link') {
      const href = mark.attrs?.href;
      if (typeof href === 'string' && LINK_PATTERN.test(href) && href.length <= LIMITS.urlLength)
        run.link = mark.attrs?.newTab === true ? { url: href, newTab: true } : { url: href };
    }
  }
  return run;
}

/** Keeps a model within the document limits (paragraphs, runs per paragraph, characters). */
export function clampRich(rich: readonly RichParagraph[]): RichParagraph[] {
  let budget = LIMITS.textLength;
  const result: RichParagraph[] = [];
  for (const paragraph of rich.slice(0, LIMITS.richParagraphs)) {
    const runs: RichRun[] = [];
    for (const run of paragraph.runs) {
      const chars = [...run.text];
      const text = chars.slice(0, Math.max(0, budget)).join('');
      budget -= chars.length;
      if (text === '') continue;
      if (runs.length >= LIMITS.richRunsPerParagraph) {
        const last = runs[runs.length - 1];
        if (last) runs[runs.length - 1] = { ...last, text: last.text + text };
      } else runs.push({ ...run, text });
    }
    result.push({ runs });
  }
  return result.length > 0 ? result : [{ runs: [] }];
}

/** ProseMirror document JSON → model. Unknown nodes and marks are dropped, never kept. */
export function docToRich(doc: PmNode): RichParagraph[] {
  const paragraphs: RichParagraph[] = [];
  for (const block of doc.content ?? []) {
    const runs: RichRun[] = [];
    for (const node of block.content ?? []) {
      if (node.type === 'text' && typeof node.text === 'string' && node.text !== '')
        pushRun(runs, runOf(node, node.text));
      else if (node.type === 'hardBreak') pushRun(runs, runOf(node, '\n'));
    }
    paragraphs.push({ runs });
  }
  return clampRich(paragraphs);
}

/** Model → ProseMirror document JSON (a break inside a run becomes a hard break node). */
export function richToDoc(rich: readonly RichParagraph[]): PmNode {
  const content = rich.map((paragraph): PmNode => {
    const nodes: PmNode[] = [];
    for (const run of paragraph.runs) {
      const marks: NonNullable<PmNode['marks']> = [];
      if (run.bold === true) marks.push({ type: 'bold' });
      if (run.italic === true) marks.push({ type: 'italic' });
      if (run.link)
        marks.push({
          type: 'link',
          attrs: { href: run.link.url, newTab: run.link.newTab === true },
        });
      run.text.split('\n').forEach((part, index) => {
        if (index > 0)
          nodes.push(marks.length > 0 ? { type: 'hardBreak', marks } : { type: 'hardBreak' });
        if (part !== '')
          nodes.push(
            marks.length > 0 ? { type: 'text', text: part, marks } : { type: 'text', text: part },
          );
      });
    }
    return nodes.length > 0 ? { type: 'paragraph', content: nodes } : { type: 'paragraph' };
  });
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] };
}

/** Stable comparison of two models (used to avoid redundant commits and echo updates). */
export function sameRich(a: readonly RichParagraph[], b: readonly RichParagraph[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
