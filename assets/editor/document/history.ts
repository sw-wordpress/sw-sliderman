import type { SliderDocument } from '@shared/types';

/**
 * Bounded undo/redo history of document states (CODE-STYLE 12.2).
 *
 * - `commit` records one step; a new step after undo drops the redo branch.
 * - A gesture (drag/resize) records exactly one step from pointer-down to pointer-up:
 *   `beginGesture` remembers the start state, intermediate updates are not recorded,
 *   `endGesture` commits once, `cancelGesture` returns the start state.
 * - Selection, zoom and network state are never part of the history.
 */
export class History {
  private past: SliderDocument[] = [];
  private future: SliderDocument[] = [];
  private gestureStart: SliderDocument | null = null;

  constructor(private readonly limit = 100) {}

  get canUndo(): boolean {
    return this.past.length > 0 && this.gestureStart === null;
  }

  get canRedo(): boolean {
    return this.future.length > 0 && this.gestureStart === null;
  }

  get inGesture(): boolean {
    return this.gestureStart !== null;
  }

  /** Records `before` as an undo step for a change that produced a new current state. */
  commit(before: SliderDocument): void {
    this.past.push(before);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  undo(current: SliderDocument): SliderDocument | null {
    const previous = this.past.pop();
    if (!previous || this.gestureStart !== null) return null;
    this.future.push(current);
    return previous;
  }

  redo(current: SliderDocument): SliderDocument | null {
    const next = this.future.pop();
    if (!next || this.gestureStart !== null) return null;
    this.past.push(current);
    return next;
  }

  beginGesture(current: SliderDocument): void {
    this.gestureStart ??= current;
  }

  /** Commits the gesture as one step when the document changed. */
  endGesture(current: SliderDocument): void {
    const start = this.gestureStart;
    this.gestureStart = null;
    if (start && start !== current) this.commit(start);
  }

  /** Returns the state before the gesture (Escape / pointercancel). */
  cancelGesture(): SliderDocument | null {
    const start = this.gestureStart;
    this.gestureStart = null;
    return start;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.gestureStart = null;
  }
}
