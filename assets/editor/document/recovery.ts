import type { SliderDocument } from '@shared/types';
import { validateDocument } from '@shared/validate';

/**
 * Local recovery copy of unsaved edits (PLAN.md 4.3, CODE-STYLE 12.2).
 *
 * One entry per site, user, slider and browser tab, so two tabs never silently overwrite each
 * other's copy. Entries contain only the document and title (no nonces or media), are bounded in
 * size and removed after the tab saved successfully. Storage access is wrapped because it can be
 * unavailable (private mode, blocked storage).
 */
export interface RecoveryEntry {
  readonly title: string;
  readonly document: SliderDocument;
  /** Server version the edits were based on. */
  readonly baseVersion: number;
  readonly savedAt: number;
  readonly tab: string;
}

const PREFIX = 'sws-recovery';
const MAX_BYTES = 600000;

function tabId(): string {
  try {
    let id = window.sessionStorage.getItem('sws-tab');
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      window.sessionStorage.setItem('sws-tab', id);
    }
    return id;
  } catch {
    return 'tab';
  }
}

export class Recovery {
  private readonly tab = tabId();

  constructor(
    private readonly scope: string,
    private readonly sliderId: number,
  ) {}

  private key(tab: string): string {
    return `${PREFIX}:${this.scope}:${this.sliderId}:${tab}`;
  }

  write(title: string, document: SliderDocument, baseVersion: number): void {
    const entry: RecoveryEntry = { title, document, baseVersion, savedAt: Date.now(), tab: this.tab };
    const json = JSON.stringify(entry);
    if (json.length > MAX_BYTES) return;
    try {
      window.localStorage.setItem(this.key(this.tab), json);
    } catch {
      /* storage full or unavailable: recovery is best effort, the server draft stays authoritative */
    }
  }

  /** Removes this tab's copy (after a successful save). */
  clear(): void {
    try {
      window.localStorage.removeItem(this.key(this.tab));
    } catch {
      /* unavailable storage: nothing to clear */
    }
  }

  /** Newest valid entry of any tab for this slider, or null. */
  newest(): RecoveryEntry | null {
    const prefix = `${PREFIX}:${this.scope}:${this.sliderId}:`;
    let best: RecoveryEntry | null = null;
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key?.startsWith(prefix)) continue;
        const entry = parseEntry(window.localStorage.getItem(key));
        if (entry && (!best || entry.savedAt > best.savedAt)) best = entry;
      }
    } catch {
      return null;
    }
    return best;
  }

  /** Discards the copies of every tab (user chose to drop the recovered changes). */
  discardAll(): void {
    const prefix = `${PREFIX}:${this.scope}:${this.sliderId}:`;
    try {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key?.startsWith(prefix)) keys.push(key);
      }
      keys.forEach((key) => window.localStorage.removeItem(key));
    } catch {
      /* unavailable storage */
    }
  }
}

/** Storage content is untrusted input: validate before use. */
export function parseEntry(raw: string | null): RecoveryEntry | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const entry = value as Record<string, unknown>;
  const result = validateDocument(entry.document);
  if (
    !result.ok ||
    typeof entry.title !== 'string' ||
    typeof entry.baseVersion !== 'number' ||
    typeof entry.savedAt !== 'number' ||
    typeof entry.tab !== 'string'
  ) {
    return null;
  }
  return {
    title: entry.title,
    document: result.document,
    baseVersion: entry.baseVersion,
    savedAt: entry.savedAt,
    tab: entry.tab,
  };
}
