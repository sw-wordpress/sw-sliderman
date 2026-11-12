/**
 * One shared `requestAnimationFrame` loop for all stages on the page (ADR 0005): the browser is
 * asked for a frame only while at least one task is registered, and idle pages cost nothing.
 */
export type FrameTask = (nowMs: number) => void;

export interface FrameClock {
  request(callback: (nowMs: number) => void): number;
  cancel(handle: number): void;
}

const browserClock: FrameClock = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export class Scheduler {
  private readonly tasks = new Set<FrameTask>();
  private handle: number | null = null;

  constructor(private readonly clock: FrameClock = browserClock) {}

  get size(): number {
    return this.tasks.size;
  }

  get running(): boolean {
    return this.handle !== null;
  }

  /** Adds a task; returns a function that removes it. */
  add(task: FrameTask): () => void {
    this.tasks.add(task);
    this.ensure();
    return () => this.remove(task);
  }

  remove(task: FrameTask): void {
    this.tasks.delete(task);
    if (this.tasks.size === 0 && this.handle !== null) {
      this.clock.cancel(this.handle);
      this.handle = null;
    }
  }

  private ensure(): void {
    if (this.handle === null && this.tasks.size > 0) this.handle = this.clock.request(this.frame);
  }

  private readonly frame = (nowMs: number): void => {
    this.handle = null;
    // Tasks may remove themselves (or others) while the frame runs.
    for (const task of [...this.tasks]) {
      if (!this.tasks.has(task)) continue;
      try {
        task(nowMs);
      } catch (error) {
        // One failing effect must never stop the others.
        console.error('sw-sliderman: effect frame failed', error);
        this.tasks.delete(task);
      }
    }
    this.ensure();
  };
}
