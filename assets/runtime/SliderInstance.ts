import { enterKeyframes, exitKeyframes, phaseTiming } from '@shared/animation';
import { resolveStage } from '@shared/layout';
import { scheduleSlide } from '@shared/schedule';
import type { RuntimeConfig } from './config';

/**
 * One slider on the page (PLAN.md 5.3, 7.1, 12; CODE-STYLE 13).
 *
 * State model:
 * - `phase`: 'ready' | 'transitioning'. Every navigation increments `generation`; timers and
 *   animation callbacks of an older generation are ignored, so fast navigation never produces
 *   overlapping states.
 * - Autoplay runs only while none of the pause reasons applies. A user pause has priority: no
 *   automatic event (visibility, hover end) resumes a slider the user paused.
 * - Reduced motion: no autoplay, no transitions, no layer animations; content is static.
 *
 * The static markup is fully readable before this class runs; it only adds behaviour.
 */
export class SliderInstance {
  private readonly slides: HTMLElement[];
  private readonly dots: HTMLButtonElement[];
  private readonly prev: HTMLButtonElement | null;
  private readonly next: HTMLButtonElement | null;
  private readonly toggle: HTMLButtonElement | null;
  private readonly live: HTMLElement | null;
  private readonly viewport: HTMLElement;
  private readonly cleanups: Array<() => void> = [];
  private readonly running = new Set<Animation>();

  private index = 0;
  private generation = 0;
  private phase: 'ready' | 'transitioning' = 'ready';
  private timer: number | null = null;
  private userPaused = false;
  private hovered = false;
  private focused = false;
  private offscreen = false;
  private reducedMotion: boolean;
  private destroyed = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly config: RuntimeConfig,
  ) {
    this.slides = Array.from(root.querySelectorAll<HTMLElement>('.sws-slide'));
    this.dots = Array.from(root.querySelectorAll<HTMLButtonElement>('.sws-dot'));
    this.prev = root.querySelector('.sws-prev');
    this.next = root.querySelector('.sws-next');
    this.toggle = root.querySelector('.sws-toggle');
    this.live = root.querySelector('.sws-live');
    this.viewport = root.querySelector<HTMLElement>('.sws-viewport') ?? root;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = motion.matches;

    root.classList.add('sws-js');
    this.listen(motion, 'change', () => {
      this.reducedMotion = motion.matches;
      if (this.reducedMotion) this.cancelAll();
      this.updateToggle();
      this.schedule();
    });
    this.bindControls();
    this.bindPauseReasons();
    this.bindSwipe();
    this.updateNavigation();
    this.updateToggle();
    void this.start();
  }

  private listen<K extends string>(
    target: EventTarget,
    type: K,
    handler: (event: Event) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options);
    this.cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  /** First slide: wait briefly for local fonts (never unbounded), then animate and schedule. */
  private async start(): Promise<void> {
    const generation = this.generation;
    const fonts = document.fonts?.ready ?? Promise.resolve();
    await Promise.race([fonts, new Promise((resolve) => window.setTimeout(resolve, 1200))]);
    if (this.destroyed || generation !== this.generation) return;
    this.playLayers(0);
    this.schedule();
  }

  private get count(): number {
    return this.slides.length;
  }

  private target(delta: 1 | -1): number | null {
    const next = this.index + delta;
    if (next >= 0 && next < this.count) return next;
    return this.config.loop ? (next + this.count) % this.count : null;
  }

  private bindControls(): void {
    if (this.prev) this.listen(this.prev, 'click', () => this.step(-1, true));
    if (this.next) this.listen(this.next, 'click', () => this.step(1, true));
    this.dots.forEach((dot, index) => this.listen(dot, 'click', () => this.goTo(index, true)));
    if (this.toggle) {
      this.listen(this.toggle, 'click', () => {
        this.userPaused = !this.userPaused;
        this.updateToggle();
        this.schedule();
      });
    }
    const controls = this.root.querySelector('.sws-controls');
    if (controls) {
      // Arrow keys only while focus is on a slider control: never in text fields or the page.
      this.listen(controls, 'keydown', (event) => {
        const key = (event as KeyboardEvent).key;
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
          event.preventDefault();
          this.step(key === 'ArrowLeft' ? -1 : 1, true);
        }
      });
    }
  }

  private bindPauseReasons(): void {
    this.listen(this.root, 'mouseenter', () => {
      this.hovered = true;
      this.schedule();
    });
    this.listen(this.root, 'mouseleave', () => {
      this.hovered = false;
      this.schedule();
    });
    this.listen(this.root, 'focusin', () => {
      this.focused = true;
      this.schedule();
    });
    this.listen(this.root, 'focusout', (event) => {
      const next = (event as FocusEvent).relatedTarget;
      this.focused = next instanceof Node && this.root.contains(next);
      this.schedule();
    });
    this.listen(document, 'visibilitychange', () => {
      if (document.hidden) this.cancelLayers();
      this.schedule();
    });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        this.offscreen = entries.every((entry) => !entry.isIntersecting);
        this.schedule();
      });
      observer.observe(this.root);
      this.cleanups.push(() => observer.disconnect());
    }
  }

  /** Horizontal swipe navigates; vertical movement stays page scrolling (`touch-action: pan-y`). */
  private bindSwipe(): void {
    let startX = 0;
    let startY = 0;
    let pointer: number | null = null;
    this.listen(this.viewport, 'pointerdown', (event) => {
      const e = event as PointerEvent;
      if (e.pointerType === 'mouse') return;
      pointer = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
    });
    this.listen(this.viewport, 'pointerup', (event) => {
      const e = event as PointerEvent;
      if (pointer !== e.pointerId) return;
      pointer = null;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) this.step(dx < 0 ? 1 : -1, true);
    });
    this.listen(this.viewport, 'pointercancel', () => {
      pointer = null;
    });
  }

  private canAutoplay(): boolean {
    return (
      this.config.autoplay &&
      !this.reducedMotion &&
      !this.userPaused &&
      !this.hovered &&
      !this.focused &&
      !this.offscreen &&
      !document.hidden &&
      this.count > 1
    );
  }

  /** (Re)starts the autoplay timer for the current slide, or stops it when a pause reason applies. */
  private schedule(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.destroyed || this.phase !== 'ready' || !this.canAutoplay()) return;
    const slide = this.config.slides[this.index];
    if (!slide) return;
    const next = this.target(1);
    if (next === null) return;
    const generation = this.generation;
    this.timer = window.setTimeout(() => {
      if (generation === this.generation) this.goTo(next, false);
    }, scheduleSlide(slide).durationMs);
  }

  private step(delta: 1 | -1, user: boolean): void {
    const target = this.target(delta);
    if (target !== null) this.goTo(target, user, delta);
  }

  goTo(index: number, user: boolean, direction: 1 | -1 = index > this.index ? 1 : -1): void {
    if (this.destroyed || index === this.index || index < 0 || index >= this.count) return;
    const generation = ++this.generation;
    this.cancelAll();
    const outgoing = this.slides[this.index];
    const incoming = this.slides[index];
    const slide = this.config.slides[index];
    if (!outgoing || !incoming || !slide) return;

    // Finish any previous transition instantly: only the outgoing slide may stay visible.
    this.slides.forEach((el) => {
      if (el !== outgoing) this.hide(el);
    });
    this.index = index;
    incoming.hidden = false;
    incoming.classList.add('sws-is-active');
    outgoing.classList.remove('sws-is-active');
    this.updateNavigation();
    if (user) this.announce();

    const type = this.reducedMotion ? 'cut' : slide.transition.type;
    const duration = slide.transition.durationMs;
    if (type === 'cut' || duration === 0) {
      this.finish(generation, outgoing, incoming);
      return;
    }
    this.phase = 'transitioning';
    const timing = { duration, easing: 'ease-in-out', fill: 'both' as const };
    const animations: Animation[] = [];
    if (type === 'fade') {
      outgoing.classList.add('sws-is-leaving');
      animations.push(incoming.animate([{ opacity: 0 }, { opacity: 1 }], timing));
    } else {
      outgoing.classList.add('sws-is-leaving');
      const from = `${direction * 100}%`;
      const to = `${direction * -100}%`;
      animations.push(incoming.animate([{ transform: `translateX(${from})` }, { transform: 'none' }], timing));
      animations.push(outgoing.animate([{ transform: 'none' }, { transform: `translateX(${to})` }], timing));
    }
    animations.forEach((animation) => this.running.add(animation));
    Promise.all(animations.map((animation) => animation.finished))
      .then(() => this.finish(generation, outgoing, incoming))
      .catch(() => {
        // Cancelled by a newer navigation; that navigation owns the state now.
      });
  }

  private finish(generation: number, outgoing: HTMLElement, incoming: HTMLElement): void {
    if (generation !== this.generation || this.destroyed) return;
    this.cancelAll();
    this.hide(outgoing);
    incoming.inert = false;
    this.phase = 'ready';
    this.playLayers(this.index);
    this.schedule();
  }

  private hide(slide: HTMLElement): void {
    slide.classList.remove('sws-is-leaving');
    slide.hidden = true;
    // `hidden` alone is undone during transitions; `inert` keeps links out of focus order and AT.
    slide.inert = true;
  }

  private playLayers(index: number): void {
    if (this.reducedMotion || document.hidden) return;
    const slideEl = this.slides[index];
    const slide = this.config.slides[index];
    if (!slideEl || !slide) return;
    const { breakpoints } = this.config;
    const width = slideEl.getBoundingClientRect().width;
    const stage = resolveStage(breakpoints, width);
    const schedule = scheduleSlide(slide);
    for (const layer of schedule.layers) {
      const el = slideEl.querySelector<HTMLElement>(`[data-sws-layer="${CSS.escape(layer.layerId)}"] .sws-layer__anim`);
      if (!el) continue;
      if (layer.enter) this.track(el.animate(enterKeyframes(layer.enter, stage.scale), phaseTiming(layer.enter, 'enter')));
      if (layer.exit) this.track(el.animate(exitKeyframes(layer.exit, stage.scale), phaseTiming(layer.exit, 'exit')));
    }
  }

  private track(animation: Animation): void {
    this.running.add(animation);
    animation.finished.then(
      () => {
        if (animation.effect?.getTiming().fill !== 'forwards') this.running.delete(animation);
      },
      () => this.running.delete(animation),
    );
  }

  private cancelLayers(): void {
    this.running.forEach((animation) => animation.cancel());
    this.running.clear();
  }

  private cancelAll(): void {
    this.cancelLayers();
    this.phase = 'ready';
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private updateNavigation(): void {
    this.dots.forEach((dot, index) => {
      if (index === this.index) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    if (this.prev) this.prev.disabled = this.target(-1) === null;
    if (this.next) this.next.disabled = this.target(1) === null;
  }

  private updateToggle(): void {
    if (!this.toggle) return;
    // Without effective autoplay (reduced motion) the toggle has nothing to control.
    this.toggle.hidden = this.reducedMotion;
    const playing = !this.userPaused;
    const label = playing ? this.toggle.dataset.labelPause : this.toggle.dataset.labelPlay;
    if (label) this.toggle.setAttribute('aria-label', label);
    this.toggle.setAttribute('aria-pressed', String(this.userPaused));
    this.toggle.querySelector('.sws-icon')?.classList.toggle('sws-icon--play', !playing);
    this.toggle.querySelector('.sws-icon')?.classList.toggle('sws-icon--pause', playing);
  }

  /** Manual changes only; autoplay never fills the live region (PLAN.md 12). */
  private announce(): void {
    const label = this.slides[this.index]?.getAttribute('aria-label');
    if (this.live && label) this.live.textContent = label;
  }

  destroy(): void {
    this.destroyed = true;
    this.generation++;
    this.cancelAll();
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    this.root.classList.remove('sws-js');
  }
}
