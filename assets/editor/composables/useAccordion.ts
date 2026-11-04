import { reactive } from 'vue';

/** Open state of the sidebar sections, shared so it survives switching layer, slide or tab. */
const open = reactive<Record<string, boolean>>({});

export function isSectionOpen(id: string, fallback: boolean): boolean {
  return open[id] ?? fallback;
}

export function setSectionOpen(id: string, value: boolean): void {
  open[id] = value;
}

/** Collapses every registered section; sections not yet seen follow their own default. */
export function setAllSections(value: boolean, ids: string[]): void {
  for (const id of ids) open[id] = value;
}

export function resetSections(): void {
  for (const key of Object.keys(open)) delete open[key];
}
