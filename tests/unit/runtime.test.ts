import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../../assets/runtime/config';
import { SliderInstance } from '../../assets/runtime/SliderInstance';
import { derivePlaybackState } from '../../assets/runtime/state';

/** Runtime state handling in jsdom (no real animations; Web Animations are stubbed). */
function markup(slides: number, autoplay: boolean): HTMLElement {
  const root = document.createElement('section');
  root.className = 'sws-slider';
  root.dataset.swsSlider = '';
  const slideHtml = Array.from(
    { length: slides },
    (_, i) =>
      `<div class="sws-slide${i === 0 ? ' sws-is-active' : ''}" aria-label="${i + 1} of ${slides}"${i === 0 ? '' : ' hidden inert'}><div class="sws-stage"><a href="#x">link</a></div></div>`,
  ).join('');
  root.innerHTML = `<div class="sws-viewport">${slideHtml}</div><div class="sws-controls">${autoplay ? '<button class="sws-toggle" data-label-pause="Pause" data-label-play="Play"><span class="sws-icon"></span></button>' : ''}<button class="sws-prev"></button><button class="sws-dot"></button><button class="sws-dot"></button><button class="sws-dot"></button><button class="sws-next"></button><p class="sws-live"></p></div>`;
  document.body.appendChild(root);
  return root;
}

function config(autoplay: boolean, loop = true) {
  const slide = (id: string) => ({
    id,
    durationMs: 3000,
    transition: { type: 'cut', durationMs: 0 },
    layers: [],
  });
  const parsed = parseConfig(
    JSON.stringify({
      autoplay,
      loop,
      breakpoints: {
        desktop: { minWidth: 1024, stageWidth: 1440, stageHeight: 600 },
        tablet: { minWidth: 768, stageWidth: 1024, stageHeight: 560 },
        mobile: { minWidth: 0, stageWidth: 390, stageHeight: 520 },
      },
      slides: [slide('a'), slide('b'), slide('c')],
    }),
  );
  if (!parsed) throw new Error('config');
  return parsed;
}

let reduced = false;
beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: reduced,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  HTMLElement.prototype.animate = vi.fn();
  Object.defineProperty(document, 'fonts', {
    value: { ready: Promise.resolve() },
    configurable: true,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const active = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('.sws-slide')).findIndex((s) => !(s as HTMLElement).hidden);

describe('runtime', () => {
  it('rejects broken configuration', () => {
    expect(parseConfig('not json')).toBeNull();
    expect(parseConfig('{"slides":[]}')).toBeNull();
  });

  it('navigates with exactly one visible, non-inert slide', () => {
    const root = markup(3, false);
    SliderInstance.create(root, config(false));
    (root.querySelector('.sws-next') as HTMLButtonElement).click();
    (root.querySelector('.sws-next') as HTMLButtonElement).click();
    const slides = Array.from(root.querySelectorAll<HTMLElement>('.sws-slide'));
    expect(slides.filter((s) => !s.hidden)).toHaveLength(1);
    expect(active(root)).toBe(2);
    expect(slides[2]?.inert).toBe(false);
    expect(slides[0]?.inert).toBe(true);
    expect(root.querySelectorAll('.sws-dot')[2]?.getAttribute('aria-current')).toBe('true');
    expect(root.querySelector('.sws-live')?.textContent).toBe('3 of 3');
  });

  it('autoplay advances, but a user pause is never resumed automatically', async () => {
    const root = markup(3, true);
    SliderInstance.create(root, config(true));
    await vi.advanceTimersByTimeAsync(1300); // font wait
    await vi.advanceTimersByTimeAsync(3000);
    expect(active(root)).toBe(1);
    (root.querySelector('.sws-toggle') as HTMLButtonElement).click();
    expect(root.querySelector('.sws-toggle')?.getAttribute('aria-label')).toBe('Play');
    root.dispatchEvent(new Event('mouseleave'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10000);
    expect(active(root)).toBe(1);
  });

  it('autoplay pauses while focus is inside and does not announce', async () => {
    const root = markup(3, true);
    SliderInstance.create(root, config(true));
    await vi.advanceTimersByTimeAsync(1300);
    root.dispatchEvent(new FocusEvent('focusin'));
    await vi.advanceTimersByTimeAsync(10000);
    expect(active(root)).toBe(0);
    root.dispatchEvent(new FocusEvent('focusout', { relatedTarget: null }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(active(root)).toBe(1);
    expect(root.querySelector('.sws-live')?.textContent).toBe('');
  });

  it('reduced motion disables autoplay and hides the toggle', async () => {
    reduced = true;
    const root = markup(3, true);
    SliderInstance.create(root, config(true));
    await vi.advanceTimersByTimeAsync(20000);
    expect(active(root)).toBe(0);
    expect((root.querySelector('.sws-toggle') as HTMLButtonElement).hidden).toBe(true);
  });

  it('without loop the navigation stops at the ends', () => {
    const root = markup(3, false);
    SliderInstance.create(root, config(false, false));
    expect((root.querySelector('.sws-prev') as HTMLButtonElement).disabled).toBe(true);
  });

  it('destroy removes listeners and timers', async () => {
    const root = markup(3, true);
    const instance = SliderInstance.create(root, config(true));
    instance.destroy();
    await vi.advanceTimersByTimeAsync(20000);
    (root.querySelector('.sws-next') as HTMLButtonElement).click();
    expect(active(root)).toBe(0);
    expect(root.classList.contains('sws-js')).toBe(false);
  });
  it('waits for a lazy image before switching slides and starting autoplay', async () => {
    const root = markup(3, true);
    const image = document.createElement('img');
    image.src = '/slow.jpg';
    image.loading = 'lazy';
    root.querySelectorAll('.sws-slide')[1]?.append(image);
    const instance = SliderInstance.create(root, config(true));
    await vi.advanceTimersByTimeAsync(0);
    instance.goTo(1, false);
    expect(image.loading).toBe('eager');
    expect(active(root)).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(active(root)).toBe(0);
    image.dispatchEvent(new Event('load'));
    await vi.advanceTimersByTimeAsync(0);
    expect(active(root)).toBe(1);
    await vi.advanceTimersByTimeAsync(2999);
    expect(active(root)).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(active(root)).toBe(2);
    instance.destroy();
  });

  it.each(['error', 'timeout'])(
    'a broken or stalled image does not block navigation: %s',
    async (mode) => {
      const root = markup(3, false);
      const image = document.createElement('img');
      image.src = '/missing.jpg';
      root.querySelectorAll('.sws-slide')[1]?.append(image);
      const instance = SliderInstance.create(root, config(false));
      instance.goTo(1, true);
      if (mode === 'error') image.dispatchEvent(new Event('error'));
      await vi.advanceTimersByTimeAsync(mode === 'timeout' ? 1200 : 0);
      expect(active(root)).toBe(1);
      instance.destroy();
    },
  );

  it('late image loads cannot undo newer navigation, including returning to the visible slide', async () => {
    const root = markup(3, false);
    const image = document.createElement('img');
    image.src = '/slow.jpg';
    root.querySelectorAll('.sws-slide')[1]?.append(image);
    const instance = SliderInstance.create(root, config(false));
    instance.goTo(1, true);
    instance.goTo(0, true);
    image.dispatchEvent(new Event('load'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(active(root)).toBe(0);
    expect(root.querySelectorAll('.sws-is-active')).toHaveLength(1);
    instance.destroy();
  });

  it('waits for first-slide images before starting the autoplay clock', async () => {
    const root = markup(3, true);
    const image = document.createElement('img');
    image.src = '/slow.jpg';
    root.querySelector('.sws-slide')?.append(image);
    const instance = SliderInstance.create(root, config(true));
    root.dispatchEvent(new Event('mouseleave')); // must not start an early timer while loading
    await vi.advanceTimersByTimeAsync(1000);
    image.dispatchEvent(new Event('load'));
    await vi.advanceTimersByTimeAsync(2999);
    expect(active(root)).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(active(root)).toBe(1);
    instance.destroy();
  });

  it('prepares entrance animations before revealing a slide and starts them after the transition', async () => {
    const root = markup(3, false);
    const animations: Array<{
      play: ReturnType<typeof vi.fn>;
      pause: ReturnType<typeof vi.fn>;
      finish: () => void;
    }> = [];
    const animate = vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(function () {
      let finish = () => {};
      const finished = new Promise<Animation>((resolve) => {
        finish = () => resolve({} as Animation);
      });
      const item = {
        play: vi.fn(),
        pause: vi.fn(),
        finish,
        cancel: vi.fn(),
        finished,
        currentTime: 0,
      };
      animations.push(item);
      return item as unknown as Animation;
    });
    const base = config(false);
    const incoming = root.querySelectorAll('.sws-slide')[1];
    if (!incoming) throw new Error('slide');
    incoming.insertAdjacentHTML(
      'beforeend',
      '<div data-sws-layer="image"><div class="sws-layer__anim"></div></div>',
    );
    const options = {
      ...base,
      slides: base.slides.map((slide) => ({
        ...slide,
        transition: { type: 'fade' as const, durationMs: 600 },
        layers: [
          {
            id: 'image',
            animation: {
              enter: {
                preset: 'fade' as const,
                startMs: 100,
                durationMs: 300,
                distance: 0,
                easing: 'ease' as const,
              },
              exit: { mode: 'slide-end' as const },
            },
          },
        ],
      })),
    };
    const instance = SliderInstance.create(root, options);
    instance.goTo(1, true);
    expect(animations[0]?.pause).toHaveBeenCalledOnce();
    expect(animations[0]?.play).not.toHaveBeenCalled();
    animations[1]?.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(animations[0]?.play).toHaveBeenCalledOnce();
    expect(active(root)).toBe(1);
    instance.destroy();
    animate.mockRestore();
  });
  it('settles an interrupted transition when the tab becomes hidden and resumes autoplay', async () => {
    const root = markup(3, true);
    const animate = vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(
      () =>
        ({
          finished: new Promise(() => {}),
          cancel: vi.fn(),
          pause: vi.fn(),
          play: vi.fn(),
          currentTime: 0,
        }) as unknown as Animation,
    );
    const base = config(true);
    const instance = SliderInstance.create(root, {
      ...base,
      slides: base.slides.map((slide) => ({
        ...slide,
        transition: { type: 'fade' as const, durationMs: 600 },
      })),
    });
    instance.goTo(1, false);
    expect(root.querySelectorAll('.sws-slide:not([hidden])')).toHaveLength(2);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(root.querySelectorAll('.sws-slide:not([hidden])')).toHaveLength(1);
    expect(active(root)).toBe(1);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(root.querySelectorAll('.sws-dot')[2]?.getAttribute('aria-current')).toBe('true');
    instance.destroy();
    hidden.mockRestore();
    animate.mockRestore();
  });
});

describe('focus handling (M4.19)', () => {
  it('keeps focus in the slider when the focused slide content is left by a swipe or key', async () => {
    const root = markup(3, false);
    const instance = SliderInstance.create(root, config(false));
    await vi.advanceTimersByTimeAsync(0);
    const link = root.querySelector('a') as HTMLAnchorElement;
    link.focus();
    expect(document.activeElement).toBe(link);
    instance.goTo(1, true);
    await vi.advanceTimersByTimeAsync(0);
    const slides = root.querySelectorAll<HTMLElement>('.sws-slide');
    expect(document.activeElement).toBe(slides[1]);
    expect(slides[1]?.tabIndex).toBe(-1);
    instance.destroy();
  });

  it('does not move focus that is on a control, and never navigates automatically while focus is inside', async () => {
    const root = markup(3, true);
    const instance = SliderInstance.create(root, config(true));
    await vi.advanceTimersByTimeAsync(0);
    const next = root.querySelector('.sws-next') as HTMLButtonElement;
    next.focus();
    next.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.activeElement).toBe(next);
    expect(active(root)).toBe(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(active(root)).toBe(1);
    instance.destroy();
  });
});

describe('deferred focus hand-over during a transition', () => {
  let releases: Array<() => void> = [];
  function fadeSetup() {
    const root = markup(3, false);
    const cfg = config(false);
    const slides = cfg.slides.map((slide) => ({
      ...slide,
      transition: { type: 'fade' as const, durationMs: 400 },
    }));
    releases = [];
    HTMLElement.prototype.animate = vi.fn().mockImplementation(() => {
      let release: () => void = () => undefined;
      const finished = new Promise<void>((resolve) => {
        release = resolve;
      });
      releases.push(release);
      return { finished, cancel: vi.fn(), play: vi.fn(), pause: vi.fn() };
    });
    return { root, instance: SliderInstance.create(root, { ...cfg, slides }) };
  }
  const finishTransition = async () => {
    releases.forEach((release) => release());
    await vi.advanceTimersByTimeAsync(0);
  };

  it('hands focus lost to <body> over to the new slide after the transition', async () => {
    const { root, instance } = fadeSetup();
    await vi.advanceTimersByTimeAsync(0);
    const link = root.querySelector('a') as HTMLAnchorElement;
    link.focus();
    instance.goTo(1, true);
    await vi.advanceTimersByTimeAsync(0);
    link.blur(); // what `inert` does to the focused element of the leaving slide
    await finishTransition();
    expect(document.activeElement).toBe(root.querySelectorAll('.sws-slide')[1]);
    instance.destroy();
  });

  it('keeps a control the user focused during the transition', async () => {
    const { root, instance } = fadeSetup();
    await vi.advanceTimersByTimeAsync(0);
    (root.querySelector('a') as HTMLAnchorElement).focus();
    instance.goTo(1, true);
    await vi.advanceTimersByTimeAsync(0);
    const dot = root.querySelector('.sws-dot') as HTMLButtonElement;
    dot.focus();
    await finishTransition();
    expect(document.activeElement).toBe(dot);
    instance.destroy();
  });

  it('keeps focus the user moved outside the slider during the transition', async () => {
    const { root, instance } = fadeSetup();
    await vi.advanceTimersByTimeAsync(0);
    const outside = document.createElement('button');
    document.body.append(outside);
    (root.querySelector('a') as HTMLAnchorElement).focus();
    instance.goTo(1, true);
    await vi.advanceTimersByTimeAsync(0);
    outside.focus();
    await finishTransition();
    expect(document.activeElement).toBe(outside);
    instance.destroy();
  });

  it('drops a pending hand-over when the transition is superseded', async () => {
    const { root, instance } = fadeSetup();
    await vi.advanceTimersByTimeAsync(0);
    (root.querySelector('a') as HTMLAnchorElement).focus();
    instance.goTo(1, true);
    await vi.advanceTimersByTimeAsync(0);
    document.dispatchEvent(new Event('visibilitychange'));
    const next = root.querySelector('.sws-next') as HTMLButtonElement;
    next.focus();
    instance.goTo(2, false);
    await vi.advanceTimersByTimeAsync(0);
    await finishTransition();
    expect(document.activeElement).toBe(next);
    instance.destroy();
  });
});

describe('touch swipe', () => {
  function pointer(target: Element, type: string, x: number, y: number, kind = 'touch'): void {
    target.dispatchEvent(
      Object.assign(new Event(type, { bubbles: true }), {
        pointerType: kind,
        pointerId: 1,
        clientX: x,
        clientY: y,
      }),
    );
  }

  it('navigates on a horizontal swipe, ignores vertical scrolling, short moves and mouse drags', async () => {
    const root = markup(3, false);
    const instance = SliderInstance.create(root, config(false));
    await vi.advanceTimersByTimeAsync(0);
    const viewport = root.querySelector('.sws-viewport') as HTMLElement;
    const swipe = (dx: number, dy: number, kind = 'touch') => {
      pointer(viewport, 'pointerdown', 200, 100, kind);
      pointer(viewport, 'pointerup', 200 + dx, 100 + dy, kind);
    };
    swipe(-30, 0);
    swipe(-80, 90);
    swipe(-120, 0, 'mouse');
    expect(active(root)).toBe(0);
    swipe(-80, 10);
    expect(active(root)).toBe(1);
    swipe(80, 0);
    expect(active(root)).toBe(0);
    pointer(viewport, 'pointerdown', 200, 100);
    pointer(viewport, 'pointercancel', 100, 100);
    pointer(viewport, 'pointerup', 100, 100);
    expect(active(root)).toBe(0);
    instance.destroy();
  });
});

describe('playback state', () => {
  const state = (root: HTMLElement) => root.dataset.swsState;

  it('derives every public state from phase, errors and pause reasons', () => {
    const base = {
      phase: 'ready',
      resourceError: false,
      autoplayEnabled: true,
      running: true,
    } as const;
    expect(derivePlaybackState(base)).toBe('playing');
    expect(derivePlaybackState({ ...base, running: false })).toBe('paused');
    expect(derivePlaybackState({ ...base, autoplayEnabled: false })).toBe('ready');
    expect(derivePlaybackState({ ...base, resourceError: true })).toBe('error');
    expect(derivePlaybackState({ ...base, phase: 'loading', resourceError: true })).toBe('loading');
    expect(derivePlaybackState({ ...base, phase: 'transitioning' })).toBe('transitioning');
  });

  it('moves loading -> playing -> paused (hover, user) -> playing and is removed on destroy', async () => {
    const root = markup(3, true);
    const instance = SliderInstance.create(root, config(true));
    expect(state(root)).toBe('loading');
    await vi.advanceTimersByTimeAsync(0);
    expect(state(root)).toBe('playing');
    root.dispatchEvent(new Event('mouseenter'));
    expect(state(root)).toBe('paused');
    root.dispatchEvent(new Event('mouseleave'));
    expect(state(root)).toBe('playing');
    (root.querySelector('.sws-toggle') as HTMLButtonElement).click();
    expect(state(root)).toBe('paused');
    instance.destroy();
    expect(state(root)).toBeUndefined();
  });

  it('is ready without autoplay and for a single slide', async () => {
    const manual = markup(3, false);
    SliderInstance.create(manual, config(false));
    await vi.advanceTimersByTimeAsync(0);
    expect(state(manual)).toBe('ready');
  });

  it('shows transitioning while a slide transition runs', async () => {
    const root = markup(3, false);
    const cfg = config(false);
    const slides = cfg.slides.map((slide) => ({
      ...slide,
      transition: { type: 'fade' as const, durationMs: 400 },
    }));
    const finished = new Promise<void>(() => undefined);
    HTMLElement.prototype.animate = vi.fn().mockReturnValue({ finished, cancel: vi.fn() });
    const instance = SliderInstance.create(root, { ...cfg, slides });
    await vi.advanceTimersByTimeAsync(0);
    instance.goTo(1, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(state(root)).toBe('transitioning');
    instance.destroy();
  });

  it.each(['error', 'timeout'])(
    'enters error after a failed or stalled image (%s) and recovers on the next slide',
    async (mode) => {
      const root = markup(3, false);
      const image = document.createElement('img');
      image.src = '/missing.jpg';
      root.querySelectorAll('.sws-slide')[1]?.append(image);
      const instance = SliderInstance.create(root, config(false));
      await vi.advanceTimersByTimeAsync(0);
      instance.goTo(1, true);
      if (mode === 'error') image.dispatchEvent(new Event('error'));
      await vi.advanceTimersByTimeAsync(mode === 'timeout' ? 1200 : 0);
      expect(active(root)).toBe(1);
      expect(state(root)).toBe('error');
      instance.goTo(2, true);
      await vi.advanceTimersByTimeAsync(0);
      expect(state(root)).toBe('ready');
      instance.destroy();
    },
  );

  it('first-slide image failure is reported as error', async () => {
    const root = markup(3, false);
    const image = document.createElement('img');
    image.src = '/missing.jpg';
    root.querySelector('.sws-slide')?.append(image);
    const instance = SliderInstance.create(root, config(false));
    image.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(0);
    expect(state(root)).toBe('error');
    instance.destroy();
  });
});

describe('hero effect lifecycle', () => {
  afterEach(() => {
    delete window.swsHeroEffects;
  });
  function withEffects() {
    const base = config(false);
    return {
      ...base,
      slides: base.slides.map((slide) => ({
        ...slide,
        effects: { cinematic: true, lightSweep: true },
      })),
    };
  }
  function player() {
    const animations: Array<{
      playState: string;
      pause: ReturnType<typeof vi.fn>;
      play: ReturnType<typeof vi.fn>;
      cancel: ReturnType<typeof vi.fn>;
      currentTime: number;
      finished: Promise<void>;
    }> = [];
    const dispose = vi.fn();
    const play = vi.fn().mockImplementation(() => {
      const animation = {
        playState: 'running',
        currentTime: 0,
        finished: new Promise<void>(() => {}),
        pause: vi.fn(() => {
          animation.playState = 'paused';
        }),
        play: vi.fn(() => {
          animation.playState = 'running';
        }),
        cancel: vi.fn(() => {
          animation.playState = 'idle';
        }),
      };
      animations.push(animation);
      return { animations: [animation], dispose };
    });
    window.swsHeroEffects = play;
    return { play, dispose, animations };
  }
  it('cancels effects on navigation and destroy, pauses on hover, focus and visibility', async () => {
    const effect = player();
    const root = markup(3, false);
    const instance = SliderInstance.create(root, withEffects());
    await vi.advanceTimersByTimeAsync(0);
    expect(effect.play).toHaveBeenCalledTimes(1);
    root.dispatchEvent(new Event('mouseenter'));
    expect(effect.animations[0]?.playState).toBe('paused');
    root.dispatchEvent(new Event('mouseleave'));
    expect(effect.animations[0]?.playState).toBe('running');
    root.dispatchEvent(new FocusEvent('focusin'));
    expect(effect.animations[0]?.playState).toBe('paused');
    root.dispatchEvent(new FocusEvent('focusout'));
    expect(effect.animations[0]?.playState).toBe('running');
    instance.goTo(1, true);
    expect(effect.dispose).toHaveBeenCalledTimes(1);
    expect(effect.play).toHaveBeenCalledTimes(2);
    instance.destroy();
    expect(effect.dispose).toHaveBeenCalledTimes(2);
    expect(effect.animations.every((a) => a.cancel.mock.calls.length > 0)).toBe(true);
  });
  it('does not run effects for reduced motion or when the optional bundle is absent', async () => {
    const effect = player();
    reduced = true;
    const root = markup(3, false);
    const instance = SliderInstance.create(root, withEffects());
    await vi.advanceTimersByTimeAsync(0);
    instance.goTo(1, true);
    expect(effect.play).not.toHaveBeenCalled();
    instance.destroy();
    reduced = false;
    delete window.swsHeroEffects;
    const fallback = SliderInstance.create(markup(3, false), withEffects());
    await vi.advanceTimersByTimeAsync(0);
    fallback.goTo(2, true);
    fallback.destroy();
  });
  it('parses effect switches strictly and keeps old configurations disabled', () => {
    expect(config(false).slides[0]?.effects).toEqual({ cinematic: false, lightSweep: false });
    const raw = withEffects();
    expect(parseConfig(JSON.stringify(raw))?.slides[0]?.effects).toEqual({
      cinematic: true,
      lightSweep: true,
    });
    expect(
      parseConfig(
        JSON.stringify({
          ...raw,
          slides: [{ ...raw.slides[0], effects: { cinematic: 1, lightSweep: 'true' } }],
        }),
      )?.slides[0]?.effects,
    ).toEqual({ cinematic: false, lightSweep: false });
  });
});
