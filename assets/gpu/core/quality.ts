/**
 * Quality tiers and adaptive control (TODO G1). The controller reduces cost step by step when the
 * smoothed frame time stays over budget and raises it again only after a long calm period
 * (hysteresis plus cooldown), so quality never oscillates.
 */

export const QUALITY_TIERS = ['low', 'medium', 'high', 'ultra'] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];
export type QualitySetting = QualityTier | 'auto';

export interface QualityProfile {
  /** Upper bound of the device pixel ratio used for the render target. */
  readonly dprCap: number;
  /** Share of the configured particle count (or comparable element count) that is simulated. */
  readonly countScale: number;
  readonly trails: boolean;
  readonly glow: boolean;
  /** Simulation rate in Hz (the fixed step is 1/60 s; 30 Hz runs two steps per update). */
  readonly simHz: 30 | 60;
}

export const QUALITY_PROFILES: Readonly<Record<QualityTier, QualityProfile>> = {
  low: { dprCap: 1, countScale: 0.25, trails: false, glow: false, simHz: 30 },
  medium: { dprCap: 1.5, countScale: 0.5, trails: false, glow: false, simHz: 60 },
  high: { dprCap: 2, countScale: 1, trails: true, glow: true, simHz: 60 },
  ultra: { dprCap: 3, countScale: 1, trails: true, glow: true, simHz: 60 },
};

export interface AdaptiveOptions {
  readonly budgetMs?: number;
  readonly start?: QualityTier;
  readonly min?: QualityTier;
  readonly max?: QualityTier;
}

const RECOVER_FRAMES = 300;
const MAX_RECOVER_FRAMES = 9600;
/** A step down within this many frames of a step up counts as a failed upgrade. */
const FAILED_UPGRADE_FRAMES = 1800;

const index = (tier: QualityTier): number => QUALITY_TIERS.indexOf(tier);

export class AdaptiveQuality {
  private tierIndex: number;
  private readonly minIndex: number;
  private readonly maxIndex: number;
  private readonly budgetMs: number;
  private smoothed = 0;
  private over = 0;
  private under = 0;
  private cooldown = 0;
  /** Calm frames needed before a step up; doubles when an upgrade is taken back right away. */
  private recoverFrames = RECOVER_FRAMES;
  private sinceUpgrade = Number.POSITIVE_INFINITY;

  constructor(options: AdaptiveOptions = {}) {
    this.budgetMs = options.budgetMs ?? 1000 / 58;
    this.minIndex = index(options.min ?? 'low');
    this.maxIndex = index(options.max ?? 'ultra');
    this.tierIndex = Math.min(
      Math.max(index(options.start ?? 'high'), this.minIndex),
      this.maxIndex,
    );
  }

  get tier(): QualityTier {
    return QUALITY_TIERS[this.tierIndex] ?? 'high';
  }

  /**
   * Feeds one frame time. Returns the new tier when it changed, otherwise null. Frames longer than
   * 250 ms (a hidden tab, a debugger) are ignored.
   */
  sample(frameMs: number): QualityTier | null {
    if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 250) return null;
    this.smoothed = this.smoothed === 0 ? frameMs : this.smoothed * 0.9 + frameMs * 0.1;
    if (this.cooldown > 0) this.cooldown--;
    this.sinceUpgrade++;
    // Frame times are quantised to the display refresh (about 16.7 ms at 60 Hz even when rendering is
    // cheap), so "calm" means: the budget is met without dropped frames, not "far below the budget".
    this.over = this.smoothed > this.budgetMs * 1.2 ? this.over + 1 : 0;
    this.under = this.smoothed <= this.budgetMs * 1.05 ? this.under + 1 : 0;
    if (this.over >= 45 && this.tierIndex > this.minIndex) {
      this.tierIndex--;
      // The higher tier did not hold: wait longer before trying it again.
      if (this.sinceUpgrade < FAILED_UPGRADE_FRAMES)
        this.recoverFrames = Math.min(this.recoverFrames * 2, MAX_RECOVER_FRAMES);
      this.sinceUpgrade = Number.POSITIVE_INFINITY;
      this.reset(600);
      return this.tier;
    }
    if (this.under >= this.recoverFrames && this.cooldown === 0 && this.tierIndex < this.maxIndex) {
      this.tierIndex++;
      this.sinceUpgrade = 0;
      this.reset(300);
      return this.tier;
    }
    return null;
  }

  private reset(cooldown: number): void {
    this.over = 0;
    this.under = 0;
    this.cooldown = cooldown;
    this.smoothed = 0;
  }
}

/** The tier a stage renders with: a fixed setting, or the adaptive tier for `auto`. */
export function resolveTier(setting: QualitySetting, adaptive: QualityTier): QualityTier {
  return setting === 'auto' ? adaptive : setting;
}
