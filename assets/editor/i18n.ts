/**
 * Translations via WordPress script translations (`wp-i18n`, CODE-STYLE 14.3).
 *
 * Source strings are English; the German catalog lives in
 * languages/sw-sliderman-de_DE-sws-editor.json and is checked by `npm run i18n:check`.
 * Outside WordPress (unit tests) the source text is returned unchanged.
 */
const DOMAIN = 'sw-sliderman';

function i18n() {
  return window.wp?.i18n;
}

export function __(text: string): string {
  return i18n()?.__(text, DOMAIN) ?? text;
}

export function _n(single: string, plural: string, count: number): string {
  return i18n()?._n(single, plural, count, DOMAIN) ?? (count === 1 ? single : plural);
}

/** `%s`/`%d`/`%1$s` placeholders, like WordPress' sprintf. */
export function sprintf(format: string, ...args: Array<string | number>): string {
  const wp = i18n();
  if (wp) return wp.sprintf(format, ...args);
  let index = 0;
  return format.replace(/%%|%(?:(\d+)\$)?[sd]/g, (match, position: string | undefined) => {
    if (match === '%%') return '%';
    const value = position ? args[Number(position) - 1] : args[index++];
    return value === undefined ? '' : String(value);
  });
}
