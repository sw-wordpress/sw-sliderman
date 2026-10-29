import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../../assets/runtime/config';
import { SliderInstance } from '../../assets/runtime/SliderInstance';

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
    new SliderInstance(root, config(false));
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
    new SliderInstance(root, config(true));
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
    new SliderInstance(root, config(true));
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
    new SliderInstance(root, config(true));
    await vi.advanceTimersByTimeAsync(20000);
    expect(active(root)).toBe(0);
    expect((root.querySelector('.sws-toggle') as HTMLButtonElement).hidden).toBe(true);
  });

  it('without loop the navigation stops at the ends', () => {
    const root = markup(3, false);
    new SliderInstance(root, config(false, false));
    expect((root.querySelector('.sws-prev') as HTMLButtonElement).disabled).toBe(true);
  });

  it('destroy removes listeners and timers', async () => {
    const root = markup(3, true);
    const instance = new SliderInstance(root, config(true));
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
    const instance = new SliderInstance(root, config(true));
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
      const instance = new SliderInstance(root, config(false));
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
    const instance = new SliderInstance(root, config(false));
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
    const instance = new SliderInstance(root, config(true));
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
    const instance = new SliderInstance(root, options);
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
    const instance = new SliderInstance(root, {
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
