import type { SlideEffects } from '@shared/types';

export interface HeroPlayback {
  readonly animations: readonly Animation[];
  dispose(): void;
}

export type HeroPlayer = (
  slide: HTMLElement,
  effects: SlideEffects,
  durationMs: number,
) => HeroPlayback;

declare global {
  interface Window {
    swsHeroEffects?: HeroPlayer;
  }
}

/** Finite, decorative effects. Layout and layer animation wrappers remain untouched. */
export const playHeroEffects: HeroPlayer = (slide, effects, durationMs) => {
  const animations: Animation[] = [];
  let sweep: HTMLElement | null = null;
  if (effects.cinematic) {
    const timing = {
      duration: Math.min(5000, durationMs),
      easing: 'ease-out',
      fill: 'forwards' as const,
    };
    const background = slide.querySelector<HTMLElement>('.sws-slide__bg');
    const stage = slide.querySelector<HTMLElement>('.sws-stage');
    if (background)
      animations.push(
        background.animate([{ transform: 'scale(1.08)' }, { transform: 'none' }], timing),
      );
    if (stage)
      animations.push(
        stage.animate([{ transform: 'translateY(6px)' }, { transform: 'none' }], timing),
      );
  }
  if (effects.lightSweep) {
    sweep = document.createElement('span');
    sweep.className = 'sws-light-sweep';
    sweep.setAttribute('aria-hidden', 'true');
    Object.assign(sweep.style, {
      position: 'absolute',
      top: '0',
      bottom: '0',
      left: '-40%',
      width: '40%',
      pointerEvents: 'none',
      zIndex: '2147483647',
      opacity: '0',
      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)',
    });
    slide.append(sweep);
    const delay = Math.min(900, durationMs / 4);
    const animation = sweep.animate(
      [
        { transform: 'translateX(0%) skewX(-18deg)', opacity: 0 },
        { opacity: 1, offset: 0.3 },
        { transform: 'translateX(400%) skewX(-18deg)', opacity: 0 },
      ],
      {
        delay,
        duration: Math.min(1500, durationMs - delay),
        easing: 'ease-in-out',
        fill: 'backwards',
      },
    );
    animations.push(animation);
    const remove = (): void => sweep?.remove();
    void animation.finished.then(remove, remove);
  }
  return {
    animations,
    dispose() {
      animations.forEach((animation) => animation.cancel());
      sweep?.remove();
    },
  };
};
