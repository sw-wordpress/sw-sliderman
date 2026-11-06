import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EffectRegistry, type EffectInstance, type EffectModule } from '@gpu/core';
import type { GpuDevice } from '@gpu/device';
import { Scheduler, type FrameClock } from '@gpu/stage/scheduler';
import { EffectStage, type StageOptions } from '@gpu/stage/stage';

/** Manual frame clock: `frame(ms)` runs the pending requestAnimationFrame callback. */
class ManualClock implements FrameClock {
  callbacks = new Map<number, (nowMs: number) => void>();
  next = 1;
  requests = 0;
  request(callback: (nowMs: number) => void): number {
    this.requests++;
    this.callbacks.set(this.next, callback);
    return this.next++;
  }
  cancel(handle: number): void {
    this.callbacks.delete(handle);
  }
  get pending(): number {
    return this.callbacks.size;
  }
  frame(nowMs: number): void {
    const due = [...this.callbacks.entries()];
    this.callbacks.clear();
    due.forEach(([, callback]) => callback(nowMs));
  }
}

describe('Scheduler', () => {
  it('asks for frames only while tasks exist and shares one request for all of them', () => {
    const clock = new ManualClock();
    const scheduler = new Scheduler(clock);
    expect(clock.pending).toBe(0);
    const a = vi.fn();
    const b = vi.fn();
    const removeA = scheduler.add(a);
    scheduler.add(b);
    expect(clock.pending).toBe(1);
    clock.frame(16);
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 1]);
    expect(clock.pending).toBe(1);
    removeA();
    clock.frame(32);
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 2]);
    scheduler.remove(b);
    expect(clock.pending).toBe(0);
    expect(scheduler.running).toBe(false);
  });

  it('lets tasks remove themselves or others while a frame runs and isolates failures', () => {
    const clock = new ManualClock();
    const scheduler = new Scheduler(clock);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const survivor = vi.fn();
    const later = vi.fn();
    scheduler.add(() => scheduler.remove(later));
    scheduler.add(() => {
      throw new Error('boom');
    });
    scheduler.add(survivor);
    scheduler.add(later);
    clock.frame(1);
    expect(survivor).toHaveBeenCalledTimes(1);
    expect(later).not.toHaveBeenCalled();
    clock.frame(2);
    expect(survivor).toHaveBeenCalledTimes(2);
    expect(scheduler.size).toBe(2);
    error.mockRestore();
  });
});

// ---------------------------------------------------------------------------------------------

type Callback<T> = (entries: T[]) => void;
let resizeCallback: Callback<{ contentRect: { width: number; height: number } }> | null = null;
let intersectionCallback: Callback<{ isIntersecting: boolean }> | null = null;
const disconnects = { resize: 0, intersection: 0 };

class FakeResizeObserver {
  constructor(callback: Callback<{ contentRect: { width: number; height: number } }>) {
    resizeCallback = callback;
  }
  observe(): void {}
  disconnect(): void {
    disconnects.resize++;
  }
}
class FakeIntersectionObserver {
  constructor(callback: Callback<{ isIntersecting: boolean }>) {
    intersectionCallback = callback;
  }
  observe(): void {}
  disconnect(): void {
    disconnects.intersection++;
  }
}

interface FakeDevice {
  device: GpuDevice;
  lost: boolean;
  events: { lost(): void; restored(): void } | null;
  resize: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

function fakeDevice(): FakeDevice {
  const state: FakeDevice = {
    lost: false,
    events: null,
    resize: vi.fn(() => true),
    dispose: vi.fn(),
    device: null as unknown as GpuDevice,
  };
  state.device = {
    get lost() {
      return state.lost;
    },
    onContext: (events: { lost(): void; restored(): void }) => {
      state.events = events;
      return () => {
        state.events = null;
      };
    },
    resize: state.resize,
    dispose: state.dispose,
  } as unknown as GpuDevice;
  return state;
}

const schema = {
  type: 'object',
  properties: { size: { type: 'number', minimum: 1, maximum: 10, default: 2 } },
};

type Spied = Record<
  | 'update'
  | 'render'
  | 'setParams'
  | 'setQuality'
  | 'handleEvent'
  | 'captureState'
  | 'transitionTo'
  | 'resize'
  | 'dispose',
  ReturnType<typeof vi.fn>
>;

interface Harness {
  clock: ManualClock;
  scheduler: Scheduler;
  host: HTMLElement;
  stage: EffectStage;
  instances: Spied[];
  devices: FakeDevice[];
  registry: EffectRegistry<GpuDevice>;
  createCalls: Array<Record<string, unknown>>;
  states: string[];
}

function harness(
  overrides: Partial<StageOptions> & {
    createFails?: boolean;
    quality?: 'auto' | 'low' | 'high';
    deviceNull?: boolean;
    reduced?: boolean;
    params?: Record<string, unknown>;
  } = {},
): Harness {
  const clock = new ManualClock();
  const scheduler = new Scheduler(clock);
  const host = document.createElement('div');
  host.getBoundingClientRect = () =>
    ({
      left: 10,
      top: 20,
      right: 410,
      bottom: 220,
      width: 400,
      height: 200,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.append(host);
  const instances: Harness['instances'] = [];
  const devices: FakeDevice[] = [];
  const createCalls: Array<Record<string, unknown>> = [];
  const registry = new EffectRegistry<GpuDevice>();
  const module: EffectModule<GpuDevice> = {
    type: 'test',
    schemaVersion: 1,
    label: 'Test',
    continuous: true,
    backends: ['webgl2'],
    parameterSchema: schema,
    create: (context, params) => {
      createCalls.push({
        ...params,
        quality: context.quality,
        seed: context.seed,
        asset: context.assets.url('image'),
      });
      if (overrides.createFails) return Promise.reject(new Error('shader failed'));
      const instance = {
        update: vi.fn(),
        render: vi.fn(),
        setParams: vi.fn(),
        setQuality: vi.fn(),
        handleEvent: vi.fn(),
        captureState: vi.fn(),
        transitionTo: vi.fn(),
        resize: vi.fn(),
        dispose: vi.fn(),
      } as unknown as Spied;
      instances.push(instance);
      return Promise.resolve(instance as unknown as EffectInstance);
    },
  };
  registry.register(module);
  const states: string[] = [];
  const stage = new EffectStage({
    host,
    config: {
      type: 'test',
      schemaVersion: 1,
      seed: 7,
      quality: overrides.quality ?? 'auto',
      params: overrides.params ?? {},
    },
    assets: { image: { url: '/a.jpg', width: 10, height: 10 } },
    registry,
    scheduler,
    createDevice: () => {
      if (overrides.deviceNull) return null;
      const device = fakeDevice();
      devices.push(device);
      return device.device;
    },
    reducedMotion: () => overrides.reduced ?? false,
    onState: (state) => states.push(state),
    ...overrides,
  });
  return { clock, scheduler, host, stage, instances, devices, registry, createCalls, states };
}

describe('EffectStage', () => {
  beforeEach(() => {
    resizeCallback = null;
    intersectionCallback = null;
    disconnects.resize = 0;
    disconnects.intersection = 0;
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('starts with an aria-hidden, unfocusable canvas, defaults applied and the asset resolved', async () => {
    const h = harness();
    await h.stage.start();
    const canvas = h.host.querySelector('canvas');
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
    expect(canvas?.tabIndex).toBe(-1);
    expect(h.createCalls).toEqual([{ size: 2, quality: 'high', seed: 7, asset: '/a.jpg' }]);
    expect(h.stage.state).toBe('running');
    expect(h.host.dataset.swsFxState).toBe('running');
  });

  it('falls back without WebGL2 and without creating a canvas', async () => {
    const h = harness({ deviceNull: true });
    await h.stage.start();
    expect(h.stage.state).toBe('fallback');
    expect(h.host.querySelector('canvas')).toBeNull();
    expect(h.createCalls).toEqual([]);
  });

  it('shows the static fallback for reduced motion without touching the GPU', async () => {
    const h = harness({ reduced: true });
    await h.stage.start();
    expect(h.stage.state).toBe('fallback');
    expect(h.devices).toHaveLength(0);
  });

  it('falls back when the module fails or the parameters are invalid', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failing = harness({ createFails: true });
    await failing.stage.start();
    expect(failing.stage.state).toBe('fallback');
    expect(failing.host.querySelector('canvas')).toBeNull();
    expect(failing.devices[0]?.dispose).toHaveBeenCalled();
    const invalid = harness({ params: { size: 99 } });
    await invalid.stage.start();
    expect(invalid.stage.state).toBe('fallback');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('runs frames on the shared scheduler, simulating fixed steps and rendering every frame', async () => {
    const h = harness();
    await h.stage.start();
    const instance = h.instances[0];
    h.clock.frame(1000);
    h.clock.frame(1000 + 1000 / 60);
    h.clock.frame(1000 + 3000 / 60);
    expect(instance?.render).toHaveBeenCalledTimes(3);
    const steps = instance?.update.mock.calls.map((call) => call[1] as number);
    expect(steps).toEqual([0, 1, 2]);
    const input = instance?.update.mock.calls[1]?.[0] as {
      time: number;
      stepSeconds: number;
      viewport: { width: number; pixelRatio: number };
    };
    expect(input.stepSeconds).toBeCloseTo(1 / 60, 6);
    expect(input.viewport).toMatchObject({ width: 400, pixelRatio: 2 });
    expect(h.host.classList.contains('sws-fx--live')).toBe(true);
  });

  it('draws the still image again when a paused effect is resized', async () => {
    const h = harness();
    await h.stage.start();
    h.clock.frame(0);
    h.clock.frame(16);
    h.stage.setPaused('user', true);
    const instance = h.instances[0];
    instance?.render.mockClear();
    resizeCallback?.([{ contentRect: { width: 500, height: 250 } }]);
    expect(instance?.render).toHaveBeenCalledTimes(1);
    const call = instance?.render.mock.calls[0]?.[0] as {
      input: { viewport: { width: number; height: number } };
      alpha: number;
    };
    expect(call.input.viewport).toMatchObject({ width: 500, height: 250 });
    expect(call.alpha).toBe(0);
    // A running effect draws in its frame loop, not on resize.
    h.stage.setPaused('user', false);
    instance?.render.mockClear();
    resizeCallback?.([{ contentRect: { width: 520, height: 250 } }]);
    expect(instance?.render).not.toHaveBeenCalled();
  });

  it('pauses for each reason and resumes only when all are cleared', async () => {
    const h = harness();
    await h.stage.start();
    h.stage.setPaused('user', true);
    h.stage.setPaused('document', true);
    expect(h.stage.state).toBe('paused');
    expect(h.clock.pending).toBe(0);
    h.stage.setPaused('user', false);
    expect(h.stage.state).toBe('paused');
    h.stage.setPaused('document', false);
    expect(h.stage.state).toBe('running');
    expect(h.clock.pending).toBe(1);
    h.clock.frame(5000);
    h.clock.frame(5016);
    expect(
      (h.instances[0]?.update.mock.calls[0]?.[0] as { deltaSeconds: number }).deltaSeconds,
    ).toBe(0); // no jump after a pause
  });

  it('pauses while offscreen and resumes when visible again', async () => {
    const h = harness();
    await h.stage.start();
    intersectionCallback?.([{ isIntersecting: false }]);
    expect(h.stage.state).toBe('paused');
    intersectionCallback?.([{ isIntersecting: true }]);
    expect(h.stage.state).toBe('running');
  });

  it('resizes the device and instance with the device pixel ratio capped by the tier', async () => {
    const h = harness();
    await h.stage.start();
    resizeCallback?.([{ contentRect: { width: 800, height: 300 } }]);
    expect(h.devices[0]?.resize).toHaveBeenLastCalledWith(800, 300, 2);
    expect(h.instances[0]?.resize).toHaveBeenLastCalledWith({
      width: 800,
      height: 300,
      pixelRatio: 2,
    });
    resizeCallback?.([{ contentRect: { width: 0, height: 0 } }]);
    expect(h.devices[0]?.resize).toHaveBeenCalledTimes(2);
  });

  it('maps the pointer through a rotated or scaled layer into its own pixels', async () => {
    const h = harness();
    await h.stage.start();
    // Layer 400x200 rotated by 90 degrees: its bounding box is 200x400 around the same centre.
    h.host.style.transform = 'matrix(0, 1, -1, 0, 0, 0)';
    h.host.getBoundingClientRect = () =>
      ({ left: 110, top: -80, right: 310, bottom: 320, width: 200, height: 400 }) as DOMRect;
    h.stage.setPointer({ x: 210, y: 120, down: false });
    h.clock.frame(100);
    h.stage.setPointer({ x: 210, y: 220, down: false });
    h.clock.frame(116);
    const centre = h.instances[0]?.update.mock.calls[0]?.[0] as { pointer: Record<string, number> };
    expect(centre.pointer).toMatchObject({ x: 200, y: 100, inside: true });
    const moved = h.instances[0]?.update.mock.calls[1]?.[0] as { pointer: Record<string, number> };
    expect(moved.pointer).toMatchObject({ x: 300, y: 100, inside: true, dx: 100, dy: 0 });
    // A zoomed editor stage (scale 0.5) maps back to the layer's pixels.
    h.host.style.transform = 'matrix(0.5, 0, 0, 0.5, 0, 0)';
    h.host.getBoundingClientRect = () =>
      ({ left: 110, top: 70, right: 310, bottom: 170, width: 200, height: 100 }) as DOMRect;
    h.stage.setPointer({ x: 160, y: 120, down: false });
    h.clock.frame(148);
    const zoomed = h.instances[0]?.update.mock.calls[2]?.[0] as { pointer: Record<string, number> };
    expect(zoomed.pointer).toMatchObject({ x: 100, y: 100, inside: true });
    // A degenerate transform falls back to the plain offset.
    h.host.style.transform = 'matrix(0, 0, 0, 0, 0, 0)';
    h.stage.setPointer({ x: 160, y: 120, down: false });
    h.clock.frame(164);
    const flat = h.instances[0]?.update.mock.calls[3]?.[0] as { pointer: Record<string, number> };
    expect(flat.pointer).toMatchObject({ x: 150, y: 100 });
  });

  it('maps the pointer into the effect area and reports movement', async () => {
    const h = harness();
    await h.stage.start();
    h.stage.setPointer({ x: 110, y: 70, down: false });
    h.clock.frame(100);
    h.stage.setPointer({ x: 130, y: 90, down: true });
    h.clock.frame(116);
    const input = h.instances[0]?.update.mock.calls[1]?.[0] as { pointer: Record<string, unknown> };
    expect(input.pointer).toEqual({ x: 120, y: 70, inside: true, down: true, dx: 20, dy: 20 });
    h.stage.setPointer({ x: 5, y: 5, down: false });
    h.clock.frame(132);
    expect(
      (h.instances[0]?.update.mock.calls[2]?.[0] as { pointer: { inside: boolean } }).pointer
        .inside,
    ).toBe(false);
    h.stage.setPointer(null);
    h.clock.frame(148);
    expect((h.instances[0]?.update.mock.calls[3]?.[0] as { pointer: unknown }).pointer).toBeNull();
  });

  it('lowers the quality tier after sustained slow frames only in auto mode', async () => {
    const auto = harness();
    await auto.stage.start();
    for (let i = 0; i < 80; i++) auto.clock.frame(i * 40);
    expect(auto.instances[0]?.setQuality).toHaveBeenCalledWith('medium');
    const fixed = harness({ quality: 'high' });
    await fixed.stage.start();
    for (let i = 0; i < 80; i++) fixed.clock.frame(i * 40);
    expect(fixed.instances[0]?.setQuality).not.toHaveBeenCalled();
  });

  it('runs half the steps on the 30 Hz low tier', async () => {
    const h = harness({ quality: 'low' });
    await h.stage.start();
    h.clock.frame(0);
    h.clock.frame(4 * (1000 / 60));
    const call = h.instances[0]?.update.mock.calls[1];
    expect(call?.[1]).toBe(2);
    expect((call?.[0] as { stepSeconds: number }).stepSeconds).toBeCloseTo(1 / 30, 6);
  });

  it('keeps real-time speed on the 30 Hz tier when every frame brings a single 1/60 s step', async () => {
    const h = harness({ quality: 'low' });
    await h.stage.start();
    h.clock.frame(0);
    for (let i = 1; i <= 10; i++) h.clock.frame(i * (1000 / 60));
    const total = h.instances[0]?.update.mock.calls
      .slice(1)
      .reduce((sum, call) => sum + (call[1] as number), 0);
    expect(total).toBe(5);
  });

  it('stops on context loss, rebuilds the instance on restoration and gives up after repeated failures', async () => {
    const h = harness();
    await h.stage.start();
    h.clock.frame(0);
    expect(h.host.classList.contains('sws-fx--live')).toBe(true);
    h.devices[0]?.events?.lost();
    expect(h.stage.state).toBe('lost');
    expect(h.clock.pending).toBe(0);
    expect(h.host.classList.contains('sws-fx--live')).toBe(false);
    h.stage.setPaused('user', true);
    h.stage.setPaused('user', false);
    expect(h.stage.state).toBe('lost');
    h.devices[0]?.events?.restored();
    await vi.waitFor(() => expect(h.stage.state).toBe('running'));
    expect(h.instances).toHaveLength(2);
    expect(h.instances[0]?.dispose).toHaveBeenCalled();
  });

  it('shows the fallback when restoration keeps failing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const h = harness();
    await h.stage.start();
    h.registry.load('test').then((m) => {
      (m as { create: unknown }).create = () => Promise.reject(new Error('gone'));
    });
    await Promise.resolve();
    for (let i = 0; i < 4 && h.stage.state !== 'fallback'; i++) {
      h.devices[0]?.events?.lost();
      h.devices[0]?.events?.restored();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(h.stage.state).toBe('fallback');
    expect(warn).toHaveBeenCalled();
  });

  it('disposes completely: no canvas, device released, observers disconnected, scheduler idle', async () => {
    const h = harness();
    await h.stage.start();
    h.stage.dispose();
    h.stage.dispose();
    expect(h.stage.state).toBe('disposed');
    expect(h.host.querySelector('canvas')).toBeNull();
    expect(h.devices[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(h.instances[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(disconnects).toEqual({ resize: 1, intersection: 1 });
    expect(h.scheduler.size).toBe(0);
    expect(h.clock.pending).toBe(0);
    await h.stage.start();
    expect(h.stage.state).toBe('disposed');
  });

  it('can release the GPU and start again; a start that is overtaken by dispose leaks nothing', async () => {
    const h = harness();
    await h.stage.start();
    h.stage.release();
    expect(h.stage.state).toBe('idle');
    expect(h.devices[0]?.dispose).toHaveBeenCalled();
    await h.stage.start();
    expect(h.stage.state).toBe('running');
    expect(h.devices).toHaveLength(2);

    const late = harness();
    const starting = late.stage.start();
    late.stage.dispose();
    await starting;
    expect(late.stage.state).toBe('disposed');
    expect(late.instances.every((instance) => instance.dispose.mock.calls.length === 1)).toBe(true);
    expect(late.host.querySelector('canvas')).toBeNull();
  });

  it('ignores concurrent start calls', async () => {
    const h = harness();
    await Promise.all([h.stage.start(), h.stage.start()]);
    expect(h.devices).toHaveLength(1);
  });
});

describe('EffectStage live changes (editor preview)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('hands validated parameters to the running instance and ignores stale or invalid edits', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const h = harness();
    await h.stage.start();
    await h.stage.reconfigure({ params: { size: 7 } });
    expect(h.instances[0]?.setParams).toHaveBeenCalledWith({ size: 7 });
    await h.stage.reconfigure({ params: { size: 99 } });
    expect(h.instances[0]?.setParams).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    await h.stage.reconfigure({});
    expect(h.instances[0]?.setParams).toHaveBeenCalledTimes(1);
    h.stage.dispose();
    await h.stage.reconfigure({ params: { size: 3 } });
    expect(h.instances[0]?.setParams).toHaveBeenCalledTimes(1);
  });

  it('applies parameters edited while the instance is still loading', async () => {
    const h = harness();
    const starting = h.stage.start();
    void h.stage.reconfigure({ params: { size: 9 } });
    await starting;
    expect(h.createCalls[0]?.size).toBe(2);
    expect(h.instances[0]?.setParams).toHaveBeenCalledWith({ size: 9 });
  });

  it('restarts for a new seed or quality but not for the same values', async () => {
    const h = harness({ quality: 'high' });
    await h.stage.start();
    await h.stage.reconfigure({ seed: 7, quality: 'high' });
    expect(h.devices).toHaveLength(1);
    await h.stage.reconfigure({ seed: 8 });
    expect(h.devices).toHaveLength(2);
    expect(h.createCalls.at(-1)).toMatchObject({ seed: 8 });
    await h.stage.reconfigure({ quality: 'low' });
    expect(h.devices).toHaveLength(3);
    expect(h.createCalls.at(-1)).toMatchObject({ quality: 'low' });
    expect(h.stage.state).toBe('running');
  });

  it('passes events to the running instance and ignores them otherwise', async () => {
    const h = harness();
    h.stage.sendEvent({ type: 'burst' });
    await h.stage.start();
    h.stage.sendEvent({ type: 'burst', intensity: 2 });
    expect(h.instances[0]?.handleEvent).toHaveBeenCalledWith({ type: 'burst', intensity: 2 });
  });
});
