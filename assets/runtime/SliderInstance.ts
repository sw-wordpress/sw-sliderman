import type { HeroPlayback } from '../browser/heroEffects';
import { prepareImages } from '../browser/images';
import { enterKeyframes, exitKeyframes, phaseTiming } from '@shared/animation';
import { resolveStage } from '@shared/layout';
import { scheduleSlide } from '@shared/schedule';
import type { RuntimeConfig } from './config';
import { derivePlaybackState } from './state';

/**
 * One slider on the page (PLAN.md 5.3, 7.1, 12; CODE-STYLE 13).
 *
 * State model:
 * - `phase`: 'loading' | 'ready' | 'transitioning'; together with pause reasons and resource errors it
 *   yields the public state (`state.ts`, `data-sws-state`). Every navigation increments `generation`; timers and
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
  private phase: 'loading' | 'ready' | 'transitioning' = 'loading';
  private resources = new AbortController();
  private readonly prepared: Animation[] = [];
  private hero: HeroPlayback | null = null;
  private timer: number | null = null;
  private userPaused = false;
  private hovered = false;
  private focused = false;
  private offscreen = false;
  private resourceError = false;
  private rescueFocus = false;
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
      if (this.reducedMotion) this.settleCurrent();
      this.updateToggle();
      this.schedule();
    });
    this.bindControls();
    this.bindPauseReasons();
    this.bindSwipe();
    this.updateNavigation();
    this.updateToggle();
    this.updateState();
  }

  /** Creates the instance and starts the first-slide sequence (async work stays out of the constructor). */
  static create(root: HTMLElement, config: RuntimeConfig): SliderInstance {
    const instance = new SliderInstance(root, config);
    void instance.start();
    return instance;
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
    let timeout: number | undefined;
    const [, imagesOk] = await Promise.all([
      Promise.race([
        fonts,
        new Promise((resolve) => {
          timeout = window.setTimeout(resolve, 1200);
        }),
      ]),
      prepareImages(this.slides[0] ?? this.root, this.resources.signal),
    ]);
    window.clearTimeout(timeout);
    if (this.destroyed || generation !== this.generation) return;
    this.resourceError = imagesOk === false;
    this.setPhase('ready');
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
      if (document.hidden) {
        if (this.phase === 'transitioning') this.settleCurrent();
        else this.cancelLayers();
      }
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

  private setPhase(phase: 'loading' | 'ready' | 'transitioning'): void {
    this.phase = phase;
    this.updateState();
  }

  private updateState(): void {
    this.root.dataset.swsState = derivePlaybackState({
      phase: this.phase,
      resourceError: this.resourceError,
      autoplayEnabled: this.config.autoplay && !this.reducedMotion && this.count > 1,
      running: this.canAutoplay(),
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
    this.updateState();
    if (this.phase === 'ready') {
      const paused =
        this.userPaused || this.hovered || this.focused || this.offscreen || document.hidden;
      this.hero?.animations.forEach((animation) => {
        if (animation.playState === 'finished' || animation.playState === 'idle') return;
        if (paused) animation.pause();
        else if (animation.playState === 'paused') animation.play();
      });
    }
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
    const outgoing = this.slides.find((el) => el.classList.contains('sws-is-active'));
    const incoming = this.slides[index];
    const slide = this.config.slides[index];
    if (!outgoing || !incoming || !slide) return;
    this.slides.forEach((el) => {
      if (el !== outgoing) this.hide(el);
    });
    outgoing.classList.remove('sws-is-leaving');
    outgoing.hidden = false;
    outgoing.inert = false;

    if (outgoing === incoming) {
      this.index = index;
      this.settleCurrent();
      this.updateNavigation();
      if (user) this.announce();
      this.playLayers(index);
      this.schedule();
      return;
    }
    this.index = index;
    this.setPhase('loading');
    this.updateNavigation();
    if (user) this.announce();
    const ready = prepareImages(incoming, this.resources.signal);
    if (ready) {
      void ready.then((ok) => {
        if (generation === this.generation) this.resourceError = !ok;
        this.show(generation, outgoing, incoming, direction);
      });
    } else {
      this.resourceError = false;
      this.show(generation, outgoing, incoming, direction);
    }
  }

  private show(
    generation: number,
    outgoing: HTMLElement,
    incoming: HTMLElement,
    direction: 1 | -1,
  ): void {
    if (generation !== this.generation || this.destroyed) return;
    const slide = this.config.slides[this.index];
    if (!slide) return;
    this.slides.forEach((el) => {
      if (el !== outgoing) this.hide(el);
    });
    // Install the hidden entrance frame before the incoming slide can paint. Its clock starts
    // only after the slide transition, so delayed entrances cannot flash their static content.
    this.playLayers(this.index, true);
    incoming.hidden = false;
    // Focus inside the leaving slide would be dropped to <body> by `inert`; the incoming slide is
    // still inert until the transition ends, so `finish()` hands the focus over.
    this.rescueFocus = outgoing.contains(document.activeElement);
    incoming.classList.add('sws-is-active');
    outgoing.classList.remove('sws-is-active');
    outgoing.inert = true;

    const type = this.reducedMotion || document.hidden ? 'cut' : slide.transition.type;
    const duration = slide.transition.durationMs;
    if (type === 'cut' || duration === 0) {
      this.finish(generation, outgoing, incoming);
      return;
    }
    this.setPhase('transitioning');
    const timing = { duration, easing: 'ease-in-out', fill: 'both' as const };
    const animations: Animation[] = [];
    if (type === 'fade') {
      outgoing.classList.add('sws-is-leaving');
      animations.push(incoming.animate([{ opacity: 0 }, { opacity: 1 }], timing));
    } else {
      outgoing.classList.add('sws-is-leaving');
      const from = `${direction * 100}%`;
      const to = `${direction * -100}%`;
      animations.push(
        incoming.animate([{ transform: `translateX(${from})` }, { transform: 'none' }], timing),
      );
      animations.push(
        outgoing.animate([{ transform: 'none' }, { transform: `translateX(${to})` }], timing),
      );
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
    this.running.forEach((animation) => {
      if (!this.prepared.includes(animation)) {
        animation.cancel();
        this.running.delete(animation);
      }
    });
    this.hide(outgoing);
    incoming.inert = false;
    if (this.rescueFocus) {
      this.rescueFocus = false;
      // Only hand over focus that is still stranded: lost to <body> by `inert`, or still inside the
      // leaving slide. A control or page element the user focused during the transition keeps it.
      const current = document.activeElement;
      if (!current || current === document.body || outgoing.contains(current)) {
        incoming.tabIndex = -1;
        incoming.focus({ preventScroll: true });
      }
    }
    this.setPhase('ready');
    this.prepared.splice(0).forEach((animation) => animation.play());
    this.schedule();
  }

  /** Cancellation must leave exactly one readable slide, even in a hidden tab. */
  private settleCurrent(): void {
    this.generation++;
    this.cancelAll();
    this.slides.forEach((slide, index) => {
      if (index !== this.index) this.hide(slide);
      else {
        slide.classList.remove('sws-is-leaving');
        slide.classList.add('sws-is-active');
        slide.hidden = false;
        slide.inert = false;
      }
    });
  }

  private hide(slide: HTMLElement): void {
    slide.classList.remove('sws-is-leaving', 'sws-is-active');
    slide.hidden = true;
    // `hidden` alone is undone during transitions; `inert` keeps links out of focus order and AT.
    slide.inert = true;
  }

  private playLayers(index: number, paused = false): void {
    if (this.reducedMotion || document.hidden) return;
    const slideEl = this.slides[index];
    const slide = this.config.slides[index];
    if (!slideEl || !slide) return;
    const { breakpoints } = this.config;
    const width = this.viewport.getBoundingClientRect().width;
    const stage = resolveStage(breakpoints, width);
    const schedule = scheduleSlide(slide);
    if (slide.effects && window.swsHeroEffects) {
      this.hero = window.swsHeroEffects(slideEl, slide.effects, schedule.durationMs);
      this.hero.animations.forEach((animation) => this.track(animation, paused));
    }
    for (const layer of schedule.layers) {
      const el = slideEl.querySelector<HTMLElement>(
        `[data-sws-layer="${CSS.escape(layer.layerId)}"] .sws-layer__anim`,
      );
      if (!el) continue;
      if (layer.enter)
        this.track(
          el.animate(enterKeyframes(layer.enter, stage.scale), phaseTiming(layer.enter, 'enter')),
          paused,
        );
      if (layer.exit)
        this.track(
          el.animate(exitKeyframes(layer.exit, stage.scale), phaseTiming(layer.exit, 'exit')),
          paused,
        );
    }
  }

  private track(animation: Animation, paused: boolean): void {
    if (paused) {
      animation.pause();
      animation.currentTime = 0;
      this.prepared.push(animation);
    }
    this.running.add(animation);
    animation.finished.then(
      () => {
        if (animation.effect?.getTiming().fill !== 'forwards') this.running.delete(animation);
      },
      () => this.running.delete(animation),
    );
  }

  private cancelLayers(): void {
    this.hero?.dispose();
    this.hero = null;
    this.running.forEach((animation) => animation.cancel());
    this.running.clear();
    this.prepared.length = 0;
  }

  private cancelAll(): void {
    this.resources.abort();
    this.resources = new AbortController();
    this.cancelLayers();
    this.rescueFocus = false;
    this.setPhase('ready');
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
    delete this.root.dataset.swsState;
  }
}
