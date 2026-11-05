/**
 * Explicit playback state of one slider (TODO M4.05), exposed as `data-sws-state` on the root.
 *
 * - `loading`: waiting for first-slide or target-slide resources (bounded, never indefinite).
 * - `transitioning`: a slide transition runs.
 * - `error`: a resource failed or timed out; the slide is shown with readable fallback content.
 * - `playing`: autoplay is running.
 * - `paused`: autoplay is configured, but a pause reason (user, hover, focus, visibility, viewport) applies.
 * - `ready`: idle without autoplay (manual navigation only, or reduced motion).
 */
export type PlaybackState = 'loading' | 'ready' | 'transitioning' | 'playing' | 'paused' | 'error';

export interface StateInput {
  readonly phase: 'loading' | 'ready' | 'transitioning';
  readonly resourceError: boolean;
  /** Autoplay is configured and possible at all (more than one slide, no reduced motion). */
  readonly autoplayEnabled: boolean;
  /** No pause reason currently applies. */
  readonly running: boolean;
}

export function derivePlaybackState(input: StateInput): PlaybackState {
  if (input.phase !== 'ready') return input.phase;
  if (input.resourceError) return 'error';
  if (!input.autoplayEnabled) return 'ready';
  return input.running ? 'playing' : 'paused';
}
