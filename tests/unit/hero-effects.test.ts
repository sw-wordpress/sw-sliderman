import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playHeroEffects } from '../../assets/browser/heroEffects';
import { enterKeyframes, exitKeyframes } from '@shared/animation';
import type { ScheduledPhase } from '@shared/schedule';

function fakeAnimation() {
  let resolve!: () => void;
  let reject!: () => void;
  const finished = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  void finished.catch(() => {});
  return { finished, cancel: vi.fn(reject), resolve, pause: vi.fn(), play: vi.fn() };
}
let created: ReturnType<typeof fakeAnimation>[];
beforeEach(() => {
  created = [];
  HTMLElement.prototype.animate = vi.fn().mockImplementation(() => {
    const animation = fakeAnimation();
    created.push(animation);
    return animation;
  });
});
afterEach(() => {
  document.body.innerHTML = '';
});

function slide() {
  const element = document.createElement('div');
  element.innerHTML =
    '<img class="sws-slide__bg"><div class="sws-stage"><div class="sws-layer__anim" style="transform:rotate(5deg)">Text</div></div>';
  document.body.append(element);
  return element;
}

describe('optional hero effects', () => {
  it('does no work when disabled, including old documents', () => {
    const element = slide();
    const playback = playHeroEffects(element, {}, 6000);
    expect(playback.animations).toHaveLength(0);
    expect(element.querySelector('.sws-light-sweep')).toBeNull();
    playback.dispose();
  });
  it('animates background and stage independently of layer timing and rotation', () => {
    const element = slide();
    const playback = playHeroEffects(element, { cinematic: true }, 60000);
    expect(playback.animations).toHaveLength(2);
    const animate = vi.mocked(HTMLElement.prototype.animate);
    expect(
      animate.mock.calls.every((call) => (call[1] as KeyframeAnimationOptions).duration === 5000),
    ).toBe(true);
    expect(element.querySelector<HTMLElement>('.sws-layer__anim')?.style.transform).toBe(
      'rotate(5deg)',
    );
    playback.dispose();
    expect(created.every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true);
  });
  it('handles missing backgrounds and stages', () => {
    const element = document.createElement('div');
    expect(playHeroEffects(element, { cinematic: true }, 1000).animations).toHaveLength(0);
  });
  it.each(['finish', 'cancel'] as const)('removes the decorative sweep on %s', async (mode) => {
    const element = slide();
    const playback = playHeroEffects(element, { lightSweep: true }, 1000);
    const sweep = element.querySelector<HTMLElement>('.sws-light-sweep');
    expect(sweep?.getAttribute('aria-hidden')).toBe('true');
    expect(sweep?.style.pointerEvents).toBe('none');
    expect(vi.mocked(HTMLElement.prototype.animate).mock.calls[0]?.[1]).toMatchObject({
      delay: 250,
      duration: 750,
    });
    if (mode === 'finish') created[0]?.resolve();
    else playback.dispose();
    await Promise.resolve();
    expect(element.querySelector('.sws-light-sweep')).toBeNull();
    playback.dispose();
  });
});

describe('masked reveals', () => {
  it.each(['reveal-left', 'reveal-circle'] as const)(
    'uses matching mask shapes in both directions: %s',
    (preset) => {
      const phase: ScheduledPhase = {
        preset,
        delayMs: 250,
        durationMs: 800,
        easing: 'ease-out',
        distance: 30,
      };
      const enter = enterKeyframes(phase, 0.5);
      expect(enter[0]?.opacity).toBe(1);
      expect(enter[0]?.clipPath).toContain(preset === 'reveal-left' ? '100%' : '0%');
      expect(enter[1]?.clipPath).toContain(preset === 'reveal-left' ? '0%' : '71%');
      expect(exitKeyframes(phase, 0.5)).toEqual([...enter].reverse());
    },
  );
});
