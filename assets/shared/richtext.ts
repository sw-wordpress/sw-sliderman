import { LINK_PATTERN } from './validate';
import type { RichParagraph, RichRun } from './types';

/**
 * Rich text rendering shared by the editor canvas and tests; src/Domain/RichText.php produces the
 * identical string for the frontend (tests/fixtures/rich/render.json). Everything is escaped
 * here, links failing the URL policy are rendered as plain text, so the result is safe markup
 * even for a document that bypassed validation.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Plain-text mirror: paragraphs joined by a line break. */
export function richPlainText(rich: readonly RichParagraph[]): string {
  return rich.map((paragraph) => paragraph.runs.map((run) => run.text).join('')).join('\n');
}

function runHtml(run: RichRun): string {
  let html = escapeHtml(run.text).replace(/\n/g, '<br>');
  if (run.italic === true) html = `<em>${html}</em>`;
  if (run.bold === true) html = `<strong>${html}</strong>`;
  const link = run.link;
  if (link !== undefined && LINK_PATTERN.test(link.url)) {
    const target = link.newTab === true ? ' target="_blank" rel="noopener noreferrer"' : '';
    html = `<a href="${escapeHtml(link.url)}"${target}>${html}</a>`;
  }
  return html;
}

/** One `<span class="sws-p">` per paragraph; an empty paragraph keeps its height with a `<br>`. */
export function richToHtml(rich: readonly RichParagraph[]): string {
  return rich
    .map((paragraph) => {
      const inner = paragraph.runs.map(runHtml).join('');
      return `<span class="sws-p">${inner === '' ? '<br>' : inner}</span>`;
    })
    .join('');
}
