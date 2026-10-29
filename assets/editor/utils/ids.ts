let counter = 0;
/** Unique DOM id for label/aria wiring (UI state, never part of the document). */
export function uid(prefix = 'sws'): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/**
 * New document-local ID (UUID v4; slides, layers, font references); matches ID_PATTERN.
 * `crypto.randomUUID` needs a secure context, wp-admin may run on plain http: fall back to
 * `getRandomValues`, which is available everywhere.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function' && window.isSecureContext) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
