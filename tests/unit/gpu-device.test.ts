import { describe, expect, it, vi } from 'vitest';
import { GpuDevice, GpuError, ResourceScope, detectCapabilities } from '@gpu/device';

/** A WebGL2 context double that records creations and deletions. */
function fakeGl(options: { compileOk?: boolean; linkOk?: boolean } = {}) {
  const calls: string[] = [];
  let id = 0;
  const make = (kind: string) => () => {
    calls.push(`create:${kind}`);
    return { kind, id: ++id };
  };
  const del = (kind: string) => () => calls.push(`delete:${kind}`);
  const lose = vi.fn();
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    INTERLEAVED_ATTRIBS: 5,
    SEPARATE_ATTRIBS: 6,
    ARRAY_BUFFER: 7,
    STATIC_DRAW: 8,
    MAX_TEXTURE_SIZE: 9,
    createShader: make('shader'),
    deleteShader: del('shader'),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: () => options.compileOk !== false,
    getShaderInfoLog: () => 'syntax error',
    createProgram: make('program'),
    deleteProgram: del('program'),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: () => options.linkOk !== false,
    getProgramInfoLog: () => 'link failed',
    transformFeedbackVaryings: vi.fn(),
    createBuffer: make('buffer'),
    deleteBuffer: del('buffer'),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    createVertexArray: make('vao'),
    deleteVertexArray: del('vao'),
    createTransformFeedback: make('tf'),
    deleteTransformFeedback: del('tf'),
    createTexture: make('texture'),
    deleteTexture: del('texture'),
    createFramebuffer: make('fbo'),
    deleteFramebuffer: del('fbo'),
    getExtension: (name: string) =>
      name === 'WEBGL_lose_context'
        ? { loseContext: lose }
        : name === 'EXT_color_buffer_float'
          ? {}
          : null,
    getParameter: () => 8192,
    isContextLost: () => false,
  };
  return { gl: gl as unknown as WebGL2RenderingContext, calls, lose, raw: gl };
}

function canvasWith(gl: unknown): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => gl) as unknown as HTMLCanvasElement['getContext'];
  return canvas;
}

describe('ResourceScope', () => {
  it('tracks every resource and releases them all, newest first, exactly once', () => {
    const { gl, calls } = fakeGl();
    const scope = new ResourceScope(gl);
    scope.program('v', 'f');
    scope.buffer(16);
    scope.buffer(new Float32Array(4), gl.STATIC_DRAW);
    scope.vertexArray();
    scope.transformFeedback();
    scope.texture();
    scope.framebuffer();
    expect(scope.size).toBe(7);
    calls.length = 0;
    scope.dispose();
    scope.dispose();
    expect(scope.size).toBe(0);
    expect(calls).toEqual([
      'delete:fbo',
      'delete:texture',
      'delete:tf',
      'delete:vao',
      'delete:buffer',
      'delete:buffer',
      'delete:program',
    ]);
    expect(() => scope.buffer(1)).toThrow(GpuError);
  });

  it('reports shader compile errors with the driver log and leaks nothing', () => {
    const { gl, calls } = fakeGl({ compileOk: false });
    const scope = new ResourceScope(gl);
    expect(() => scope.program('v', 'f')).toThrow(/syntax error/);
    expect(calls).toContain('delete:shader');
    expect(scope.size).toBe(0);
  });

  it('reports link errors and deletes the program', () => {
    const { gl, calls } = fakeGl({ linkOk: false });
    expect(() => new ResourceScope(gl).program('v', 'f')).toThrow(/link failed/);
    expect(calls.filter((c) => c === 'delete:program')).toHaveLength(1);
  });

  it('declares transform feedback varyings before linking', () => {
    const { gl, raw } = fakeGl();
    new ResourceScope(gl).program('v', 'f', { varyings: ['vPos', 'vVel'], separateAttribs: true });
    expect(raw.transformFeedbackVaryings).toHaveBeenCalledWith(
      expect.anything(),
      ['vPos', 'vVel'],
      6,
    );
  });

  it('survives a context that rejects deletes', () => {
    const { gl, raw } = fakeGl();
    const scope = new ResourceScope(gl);
    scope.buffer(8);
    raw.deleteBuffer = () => {
      throw new Error('lost');
    };
    expect(() => scope.dispose()).not.toThrow();
  });

  it('fails clearly when the driver cannot create objects', () => {
    const { gl, raw } = fakeGl();
    for (const name of [
      'createBuffer',
      'createVertexArray',
      'createTransformFeedback',
      'createTexture',
      'createFramebuffer',
      'createProgram',
      'createShader',
    ] as const) {
      raw[name] = () => null as never;
    }
    const scope = new ResourceScope(gl);
    expect(() => scope.buffer(1)).toThrow(GpuError);
    expect(() => scope.vertexArray()).toThrow(GpuError);
    expect(() => scope.transformFeedback()).toThrow(GpuError);
    expect(() => scope.texture()).toThrow(GpuError);
    expect(() => scope.framebuffer()).toThrow(GpuError);
    expect(() => scope.program('v', 'f')).toThrow(GpuError);
  });
});

describe('GpuDevice', () => {
  it('is null without WebGL2 (missing context or a throwing driver)', () => {
    const none = document.createElement('canvas');
    none.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
    expect(GpuDevice.create(none)).toBeNull();
    const broken = document.createElement('canvas');
    broken.getContext = (() => {
      throw new Error('blocked');
    }) as unknown as HTMLCanvasElement['getContext'];
    expect(GpuDevice.create(broken)).toBeNull();
  });

  it('resizes the drawing buffer by device pixel ratio and reports changes', () => {
    const device = GpuDevice.create(canvasWith(fakeGl().gl));
    expect(device?.resize(300, 150, 2)).toBe(true);
    expect(device?.canvas.width).toBe(600);
    expect(device?.resize(300, 150, 2)).toBe(false);
    expect(device?.resize(0, 0, 1)).toBe(true);
    expect(device?.canvas.width).toBe(1);
  });

  it('forwards context loss and restoration and can unsubscribe', () => {
    const device = GpuDevice.create(canvasWith(fakeGl().gl));
    const events = { lost: vi.fn(), restored: vi.fn() };
    const off = device?.onContext(events);
    const lostEvent = new Event('webglcontextlost', { cancelable: true });
    device?.canvas.dispatchEvent(lostEvent);
    expect(lostEvent.defaultPrevented).toBe(true);
    expect(device?.lost).toBe(true);
    device?.canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(events.lost).toHaveBeenCalledTimes(1);
    expect(events.restored).toHaveBeenCalledTimes(1);
    expect(device?.lost).toBe(false);
    off?.();
    device?.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(events.lost).toHaveBeenCalledTimes(1);
  });

  it('disposes all scopes and gives the context back', () => {
    const { gl, calls, lose } = fakeGl();
    const device = GpuDevice.create(canvasWith(gl));
    const a = device?.scope();
    const b = device?.scope();
    a?.buffer(4);
    b?.texture();
    expect(device?.resourceCount).toBe(2);
    calls.length = 0;
    device?.dispose();
    device?.dispose();
    expect(calls.sort()).toEqual(['delete:buffer', 'delete:texture']);
    expect(lose).toHaveBeenCalledTimes(1);
    expect(device?.resourceCount).toBe(0);
  });
});

describe('detectCapabilities', () => {
  it('reports WebGL2, float targets and limits, and releases the probe context', () => {
    const { gl, lose } = fakeGl();
    const caps = detectCapabilities(() => canvasWith(gl), { gpu: {} });
    expect(caps).toEqual({
      backend: 'webgl2',
      webgl2: true,
      floatTargets: true,
      maxTextureSize: 8192,
      webgpu: true,
    });
    expect(lose).toHaveBeenCalled();
  });

  it('falls back to none without WebGL2 or when the probe throws', () => {
    const none = document.createElement('canvas');
    none.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
    expect(detectCapabilities(() => none, {})).toMatchObject({
      backend: 'none',
      webgl2: false,
      webgpu: false,
    });
    const broken = document.createElement('canvas');
    broken.getContext = (() => {
      throw new Error('x');
    }) as unknown as HTMLCanvasElement['getContext'];
    expect(detectCapabilities(() => broken, {}).backend).toBe('none');
  });
});
