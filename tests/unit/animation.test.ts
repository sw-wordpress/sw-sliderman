import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enterKeyframes, exitKeyframes, phaseTiming } from '@shared/animation';
import { scheduleSlide } from '@shared/schedule';
import { ANIMATION_PRESETS, EASINGS } from '@shared/types';
import { parseConfig } from '../../assets/runtime/config';
import { SliderInstance } from '../../assets/runtime/SliderInstance';

const ROOT = resolve(__dirname, '../..');

const phase = (preset: (typeof ANIMATION_PRESETS)[number]) => ({
  preset,
  delayMs: 100,
  durationMs: 400,
  easing: 'ease-out' as const,
  distance: 40,
});

describe('animation presets (M4.01, M4.03)', () => {
  it('presets and easings mirror the PHP validator', () => {
    const php = readFileSync(resolve(ROOT, 'src/Domain/DocumentValidator.php'), 'utf8');
    const list = (name: string): string[] =>
      [
        ...(new RegExp(`const ${name}\\s*=\\s*array\\(([^)]*)\\)`).exec(php)?.[1] ?? '').matchAll(
          /'([^']+)'/g,
        ),
      ].map((m) => m[1] ?? '');
    expect(list('ANIMATION_PRESETS')).toEqual([...ANIMATION_PRESETS]);
    expect(list('EASINGS')).toEqual([...EASINGS]);
  });

  it.each(ANIMATION_PRESETS.filter((preset) => preset !== 'none'))(
    '%s animates only opacity, transform and clip-path and ends visible',
    (preset) => {
      for (const frames of [enterKeyframes(phase(preset), 1), exitKeyframes(phase(preset), 1)]) {
        expect(frames).toHaveLength(2);
        for (const frame of frames) {
          expect(
            Object.keys(frame).every((key) => ['opacity', 'transform', 'clipPath'].includes(key)),
          ).toBe(true);
        }
      }
      const enter = enterKeyframes(phase(preset), 1);
      expect(enter[1]).toMatchObject({ opacity: 1 });
      expect(enter[0]).not.toEqual(enter[1]);
      expect(exitKeyframes(phase(preset), 1)[0]).toEqual(enter[1]);
    },
  );

  it('moves in opposite directions for enter and exit and scales the distance to the rendered stage', () => {
    expect(enterKeyframes(phase('slide-up'), 0.5)[0]?.transform).toBe('translate3d(0, 20px, 0)');
    expect(exitKeyframes(phase('slide-up'), 0.5)[1]?.transform).toBe('translate3d(0, -20px, 0)');
  });

  it('timing: enter shows its first frame during the delay, exit stays hidden afterwards', () => {
    expect(phaseTiming(phase('fade'), 'enter')).toMatchObject({
      delay: 100,
      duration: 400,
      fill: 'backwards',
    });
    expect(phaseTiming(phase('fade'), 'exit').fill).toBe('forwards');
  });

  it('none and zero duration produce no scheduled phase; slide-end exits are not timed', () => {
    const base = { easing: 'ease' as const, distance: 0, startMs: 0 };
    const schedule = scheduleSlide({
      durationMs: 3000,
      layers: [
        {
          id: 'a',
          animation: {
            enter: { ...base, preset: 'none', durationMs: 500 },
            exit: { mode: 'slide-end' },
          },
        },
        {
          id: 'b',
          animation: {
            enter: { ...base, preset: 'fade', durationMs: 0 },
            exit: { mode: 'slide-end' },
          },
        },
        {
          id: 'c',
          animation: {
            enter: { ...base, preset: 'fade', durationMs: 500 },
            exit: { mode: 'timed', ...base, preset: 'fade', startMs: 4000, durationMs: 1500 },
          },
        },
      ],
    });
    expect(schedule.layers.map((layer) => [layer.enter !== null, layer.exit !== null])).toEqual([
      [false, false],
      [false, false],
      [true, true],
    ]);
    expect(schedule).toMatchObject({ durationMs: 5500, extended: true });
  });
});

describe('slide transitions (M4.04)', () => {
  const animate = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('CSS', { escape: (value: string) => value });
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    Object.defineProperty(document, 'fonts', {
      value: { ready: Promise.resolve() },
      configurable: true,
    });
    animate
      .mockReset()
      .mockImplementation(() => ({ finished: new Promise(() => undefined), cancel: vi.fn() }));
    HTMLElement.prototype.animate = animate;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  function setup(type: 'cut' | 'fade' | 'slide'): { root: HTMLElement; instance: SliderInstance } {
    const root = document.createElement('section');
    root.innerHTML =
      '<div class="sws-viewport"><div class="sws-slide sws-is-active"></div><div class="sws-slide" hidden inert></div></div>';
    document.body.appendChild(root);
    const slide = (id: string) => ({
      id,
      durationMs: 3000,
      transition: { type, durationMs: 500 },
      layers: [],
    });
    const config = parseConfig(
      JSON.stringify({
        autoplay: false,
        loop: true,
        breakpoints: {
          desktop: { minWidth: 1024, stageWidth: 1440, stageHeight: 600 },
          tablet: { minWidth: 768, stageWidth: 1024, stageHeight: 560 },
          mobile: { minWidth: 0, stageWidth: 390, stageHeight: 520 },
        },
        slides: [slide('a'), slide('b')],
      }),
    );
    if (!config) throw new Error('config');
    return { root, instance: SliderInstance.create(root, config) };
  }

  it('cut switches immediately without an animation', async () => {
    const { root, instance } = setup('cut');
    await vi.advanceTimersByTimeAsync(0);
    instance.goTo(1, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(animate).not.toHaveBeenCalled();
    expect(root.querySelectorAll<HTMLElement>('.sws-slide')[1]?.hidden).toBe(false);
    instance.destroy();
  });

  it('fade animates the incoming slide opacity', async () => {
    const { instance } = setup('fade');
    await vi.advanceTimersByTimeAsync(0);
    instance.goTo(1, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]?.[0]).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    instance.destroy();
  });

  it('slide moves both slides horizontally, against the navigation direction when going back', async () => {
    const { instance } = setup('slide');
    await vi.advanceTimersByTimeAsync(0);
    instance.goTo(1, true, 1);
    await vi.advanceTimersByTimeAsync(0);
    expect(animate.mock.calls.map((call) => call[0])).toEqual([
      [{ transform: 'translateX(100%)' }, { transform: 'none' }],
      [{ transform: 'none' }, { transform: 'translateX(-100%)' }],
    ]);
    instance.destroy();
  });
});
