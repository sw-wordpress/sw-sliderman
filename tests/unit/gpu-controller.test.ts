import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EffectRegistry, type EffectInstance, type EffectModule } from '@gpu/core';
import type { GpuDevice } from '@gpu/device';
import type { EffectEntry } from '../../assets/browser/gpuHost';
import { EffectController } from '@gpu/stage/controller';
import { Scheduler, type FrameClock } from '@gpu/stage/scheduler';

class ManualClock implements FrameClock {
  callbacks = new Map<number, (nowMs: number) => void>();
  next = 1;
  request(callback: (nowMs: number) => void): number {
    this.callbacks.set(this.next, callback);
    return this.next++;
  }
  cancel(handle: number): void {
    this.callbacks.delete(handle);
  }
  frame(nowMs: number): void {
    const due = [...this.callbacks.values()];
    this.callbacks.clear();
    due.forEach((callback) => callback(nowMs));
  }
}

const entry = (layerId: string, overrides: Partial<EffectEntry> = {}): EffectEntry => ({
  layerId,
  type: 'vendor/test',
  schemaVersion: 1,
  seed: 3,
  quality: 'high',
  continuous: true,
  module: '/wp-content/plugins/vendor/test.js?ver=1',
  params: {},
  assets: {},
  ...overrides,
});

function slideWith(...layerIds: string[]): HTMLElement {
  const slide = document.createElement('div');
  slide.className = 'sws-slide';
  for (const id of layerIds) {
    slide.insertAdjacentHTML(
      'beforeend',
      `<div data-sws-layer="${id}"><div class="sws-fx"></div></div>`,
    );
  }
  return slide;
}

interface Fixture {
  root: HTMLElement;
  clock: ManualClock;
  controller: EffectController;
  registry: EffectRegistry<GpuDevice>;
  instances: Array<Record<string, ReturnType<typeof vi.fn>>>;
  devices: number;
  imports: string[];
  states: string[];
  disposedDevices: () => number;
}

function fixture(
  entries: EffectEntry[],
  options: { reduced?: boolean; moduleFactory?: unknown; idleReleaseMs?: number } = {},
): Fixture {
  const clock = new ManualClock();
  const root = document.createElement('section');
  document.body.append(root);
  const registry = new EffectRegistry<GpuDevice>();
  const instances: Fixture['instances'] = [];
  const imports: string[] = [];
  const states: string[] = [];
  let disposed = 0;
  let devices = 0;
  const factory = (): EffectModule<GpuDevice> => ({
    type: 'vendor/test',
    schemaVersion: 1,
    label: 'T',
    continuous: true,
    backends: ['webgl2'],
    parameterSchema: { type: 'object', properties: {} },
    create: () => {
      const instance = {
        update: vi.fn(),
        render: vi.fn(),
        setQuality: vi.fn(),
        resize: vi.fn(),
        dispose: vi.fn(),
      };
      instances.push(instance);
      return Promise.resolve(instance as unknown as EffectInstance);
    },
  });
  const controller = new EffectController(root, entries, options.reduced ?? false, {
    registry,
    scheduler: new Scheduler(clock),
    createDevice: () => {
      devices++;
      return {
        lost: false,
        onContext: () => () => undefined,
        resize: () => true,
        dispose: () => disposed++,
      } as unknown as GpuDevice;
    },
    importModule: (url) => {
      imports.push(url);
      return Promise.resolve({
        default: 'moduleFactory' in options ? options.moduleFactory : factory,
      });
    },
    idleReleaseMs: options.idleReleaseMs ?? 1000,
    onState: (id, state) => states.push(`${id}:${state}`),
  });
  return {
    root,
    clock,
    controller,
    registry,
    instances,
    get devices() {
      return devices;
    },
    imports,
    states,
    disposedDevices: () => disposed,
  };
}

describe('EffectController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('CSS', { escape: (value: string) => value });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('loads each module once from the URL in the slider config and starts only the visible slide', async () => {
    const f = fixture([entry('a'), entry('b')]);
    const first = slideWith('a');
    const second = slideWith('b');
    f.controller.activate(first);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.imports).toEqual(['/wp-content/plugins/vendor/test.js?ver=1']);
    expect(f.devices).toBe(1);
    expect(first.querySelector('canvas')).not.toBeNull();
    expect(second.querySelector('canvas')).toBeNull();
    f.controller.activate(second);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.imports).toHaveLength(1);
    expect(f.instances).toHaveLength(2);
  });

  it('pauses a left slide at once and returns its GPU resources after the idle time', async () => {
    const f = fixture([entry('a')], { idleReleaseMs: 500 });
    const slide = slideWith('a');
    f.controller.activate(slide);
    await vi.advanceTimersByTimeAsync(0);
    f.controller.deactivate(slide);
    expect(slide.querySelector('.sws-fx')?.getAttribute('data-sws-fx-state')).toBe('paused');
    await vi.advanceTimersByTimeAsync(499);
    expect(f.disposedDevices()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.disposedDevices()).toBe(1);
    expect(slide.querySelector('canvas')).toBeNull();
    f.controller.activate(slide);
    await vi.advanceTimersByTimeAsync(0);
    expect(slide.querySelector('.sws-fx')?.getAttribute('data-sws-fx-state')).toBe('running');
    expect(f.devices).toBe(2);
  });

  it('keeps the GPU when the slide is shown again before the idle time ends', async () => {
    const f = fixture([entry('a')], { idleReleaseMs: 500 });
    const slide = slideWith('a');
    f.controller.activate(slide);
    await vi.advanceTimersByTimeAsync(0);
    f.controller.deactivate(slide);
    await vi.advanceTimersByTimeAsync(300);
    f.controller.activate(slide);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.disposedDevices()).toBe(0);
    expect(f.devices).toBe(1);
  });

  it('applies the slider pause switch, also to stages created later, and hides with the document', async () => {
    const f = fixture([entry('a')]);
    f.controller.setUserPaused(true);
    const slide = slideWith('a');
    f.controller.activate(slide);
    await vi.advanceTimersByTimeAsync(0);
    const host = slide.querySelector('.sws-fx');
    expect(host?.getAttribute('data-sws-fx-state')).toBe('paused');
    f.controller.setUserPaused(false);
    expect(host?.getAttribute('data-sws-fx-state')).toBe('running');
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(host?.getAttribute('data-sws-fx-state')).toBe('paused');
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(host?.getAttribute('data-sws-fx-state')).toBe('running');
  });

  it('shows the static fallback for reduced motion and restarts when the preference ends', async () => {
    const f = fixture([entry('a')], { reduced: true });
    const slide = slideWith('a');
    f.controller.activate(slide);
    await vi.advanceTimersByTimeAsync(0);
    expect(slide.querySelector('.sws-fx')?.getAttribute('data-sws-fx-state')).toBe('fallback');
    expect(f.devices).toBe(0);
    f.controller.setReducedMotion(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.devices).toBe(1);
    expect(slide.querySelector('canvas')).not.toBeNull();
    f.controller.setReducedMotion(true);
    expect(slide.querySelector('canvas')).toBeNull();
    f.controller.setReducedMotion(true);
  });

  it('forwards pointer movement from the slider to the running effects, never the canvas', async () => {
    const f = fixture([entry('a')]);
    const slide = slideWith('a');
    f.root.append(slide);
    const host = slide.querySelector('.sws-fx') as HTMLElement;
    host.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    f.controller.activate(slide);
    await vi.advanceTimersByTimeAsync(0);
    f.root.dispatchEvent(
      Object.assign(new Event('pointermove', { bubbles: true }), {
        clientX: 40,
        clientY: 50,
        buttons: 1,
      }),
    );
    f.clock.frame(0);
    f.clock.frame(16);
    const input = f.instances[0]?.update?.mock.calls[1]?.[0] as {
      pointer: { x: number; y: number; down: boolean };
    };
    expect(input.pointer).toMatchObject({ x: 40, y: 50, down: true });
    f.root.dispatchEvent(new Event('pointerleave'));
    f.clock.frame(32);
    expect((f.instances[0]?.update?.mock.calls[2]?.[0] as { pointer: unknown }).pointer).toBeNull();
  });

  it('ignores entries without a host in the slide and unknown slides', async () => {
    const f = fixture([entry('a'), entry('missing')]);
    const slide = slideWith('a');
    f.controller.deactivate(slideWith('other'));
    f.controller.activate(slide);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.devices).toBe(1);
  });

  it('falls back when a module file does not export a factory', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const f = fixture([entry('a')], { moduleFactory: 'not a function' });
    const slide = slideWith('a');
    f.controller.activate(slide);
    await vi.advanceTimersByTimeAsync(0);
    expect(slide.querySelector('.sws-fx')?.getAttribute('data-sws-fx-state')).toBe('fallback');
    expect(slide.querySelector('canvas')).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('destroys everything: stages, timers, listeners', async () => {
    const f = fixture([entry('a')], { idleReleaseMs: 500 });
    const slide = slideWith('a');
    f.controller.activate(slide);
    await vi.advanceTimersByTimeAsync(0);
    f.controller.deactivate(slide);
    f.controller.destroy();
    f.controller.destroy();
    expect(f.disposedDevices()).toBe(1);
    expect(slide.querySelector('canvas')).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.disposedDevices()).toBe(1);
    f.controller.activate(slide);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.devices).toBe(1);
    f.root.dispatchEvent(new Event('pointermove'));
  });

  it('reuses a module that is already registered, for example by another slider', () => {
    const f = fixture([entry('a')]);
    const again = fixture([entry('a')]);
    expect(f.registry.has('vendor/test')).toBe(true);
    expect(again.registry).not.toBe(f.registry);
    const shared = f.registry;
    const second = new EffectController(document.createElement('div'), [entry('x')], false, {
      registry: shared,
      scheduler: new Scheduler(new ManualClock()),
      createDevice: () => null,
      importModule: () => Promise.reject(new Error('must not load again')),
    });
    second.destroy();
  });
});
