/**
 * Fixed simulation step with an accumulator (TODO G1): forces and drag are integrated with a
 * constant step, so 60, 120 or 144 Hz displays produce the same motion. Long frames (a hidden tab,
 * a breakpoint) are capped, and a backlog is dropped instead of causing a catch-up spiral.
 */

export interface StepperOptions {
  /** Simulation step in seconds. */
  readonly stepSeconds?: number;
  /** Largest frame delta that is simulated; anything beyond is discarded. */
  readonly maxFrameSeconds?: number;
  /** Largest number of steps per rendered frame. */
  readonly maxSteps?: number;
}

export interface StepResult {
  /** Fixed steps to simulate now. */
  readonly steps: number;
  /** Fraction of the next step already elapsed (0 ≤ alpha < 1), for render interpolation. */
  readonly alpha: number;
  /** Steps that were dropped because the backlog exceeded `maxSteps`. */
  readonly dropped: number;
}

export class FixedStepper {
  readonly stepSeconds: number;
  private readonly maxFrameSeconds: number;
  private readonly maxSteps: number;
  private accumulator = 0;

  constructor(options: StepperOptions = {}) {
    this.stepSeconds = options.stepSeconds ?? 1 / 60;
    this.maxFrameSeconds = options.maxFrameSeconds ?? 0.25;
    this.maxSteps = options.maxSteps ?? 5;
  }

  advance(deltaSeconds: number): StepResult {
    const delta =
      Number.isFinite(deltaSeconds) && deltaSeconds > 0
        ? Math.min(deltaSeconds, this.maxFrameSeconds)
        : 0;
    this.accumulator += delta;
    const due = Math.floor(this.accumulator / this.stepSeconds + 1e-9);
    const steps = Math.min(due, this.maxSteps);
    this.accumulator -= steps * this.stepSeconds;
    const dropped = due - steps;
    if (dropped > 0) this.accumulator = 0;
    return {
      steps,
      alpha: Math.min(Math.max(this.accumulator / this.stepSeconds, 0), 0.999999),
      dropped,
    };
  }

  reset(): void {
    this.accumulator = 0;
  }
}
