import { getConfig } from '@editor/config';

/** Locale for Intl formatting derived from the WordPress locale (de_DE_formal -> de-DE). */
export function intlLocale(): string {
  try {
    return getConfig().locale.replace('_formal', '').replace('_', '-');
  } catch {
    return 'en-US';
  }
}

/** Formats a stored UTC timestamp (`Y-m-d H:i:s`) in the user's locale and time zone. */
export function formatGmt(value: string | null): string {
  if (!value) return '–';
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** Integer/decimal formatting for numeric inputs and labels. */
export function formatNumber(value: number, digits = 1): string {
  return new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: digits }).format(value);
}
