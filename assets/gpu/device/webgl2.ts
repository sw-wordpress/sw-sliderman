/**
 * WebGL2 device (ADR 0005): owns one canvas context and tracks every GPU resource in scopes, so an
 * effect instance can release all of its resources with one call (no leaks), and a lost context can
 * be rebuilt from scratch.
 */

export class GpuError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GpuError';
  }
}

export interface ProgramOptions {
  /** Output varyings captured by transform feedback (GPU-resident simulation). */
  readonly varyings?: readonly string[];
  readonly separateAttribs?: boolean;
}

/** Resources created through a scope are deleted together. */
export class ResourceScope {
  private readonly disposers: Array<() => void> = [];
  private disposed = false;

  constructor(private readonly gl: WebGL2RenderingContext) {}

  /** Number of live resources (for leak tests). */
  get size(): number {
    return this.disposers.length;
  }

  private track<T>(resource: T, release: (gl: WebGL2RenderingContext, resource: T) => void): T {
    if (this.disposed) throw new GpuError('Resource scope is disposed.');
    this.disposers.push(() => release(this.gl, resource));
    return resource;
  }

  program(vertex: string, fragment: string, options: ProgramOptions = {}): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type);
      if (!shader) throw new GpuError('Could not create a shader.');
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
        const log = gl.getShaderInfoLog(shader) ?? '';
        gl.deleteShader(shader);
        throw new GpuError(`Shader compile error: ${log}`);
      }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, vertex);
    const fs = compile(gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram();
    if (!program) throw new GpuError('Could not create a program.');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    if (options.varyings) {
      gl.transformFeedbackVaryings(
        program,
        [...options.varyings],
        options.separateAttribs ? gl.SEPARATE_ATTRIBS : gl.INTERLEAVED_ATTRIBS,
      );
    }
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
      const log = gl.getProgramInfoLog(program) ?? '';
      gl.deleteProgram(program);
      throw new GpuError(`Program link error: ${log}`);
    }
    return this.track(program, (g, p) => g.deleteProgram(p));
  }

  buffer(
    data: BufferSource | ArrayBufferView | number,
    usage: number = this.gl.STATIC_DRAW,
    target: number = this.gl.ARRAY_BUFFER,
  ): WebGLBuffer {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    if (!buffer) throw new GpuError('Could not create a buffer.');
    gl.bindBuffer(target, buffer);
    if (typeof data === 'number') gl.bufferData(target, data, usage);
    else gl.bufferData(target, data as BufferSource, usage);
    return this.track(buffer, (g, b) => g.deleteBuffer(b));
  }

  vertexArray(): WebGLVertexArrayObject {
    const vao = this.gl.createVertexArray();
    if (!vao) throw new GpuError('Could not create a vertex array.');
    return this.track(vao, (g, v) => g.deleteVertexArray(v));
  }

  transformFeedback(): WebGLTransformFeedback {
    const tf = this.gl.createTransformFeedback();
    if (!tf) throw new GpuError('Could not create a transform feedback object.');
    return this.track(tf, (g, t) => g.deleteTransformFeedback(t));
  }

  texture(): WebGLTexture {
    const texture = this.gl.createTexture();
    if (!texture) throw new GpuError('Could not create a texture.');
    return this.track(texture, (g, t) => g.deleteTexture(t));
  }

  framebuffer(): WebGLFramebuffer {
    const fbo = this.gl.createFramebuffer();
    if (!fbo) throw new GpuError('Could not create a framebuffer.');
    return this.track(fbo, (g, f) => g.deleteFramebuffer(f));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const release of this.disposers.splice(0).reverse()) {
      try {
        release();
      } catch {
        /* a lost context may reject deletes; the resources are gone anyway */
      }
    }
  }
}

export interface DeviceEvents {
  lost(): void;
  restored(): void;
}

export class GpuDevice {
  readonly gl: WebGL2RenderingContext;
  private readonly scopes = new Set<ResourceScope>();
  private readonly listeners: Array<() => void> = [];
  private contextLost = false;
  private released = false;

  private constructor(
    readonly canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
  ) {
    this.gl = gl;
  }

  /** Creates the device for `canvas`, or null when WebGL2 is not available. */
  static create(canvas: HTMLCanvasElement): GpuDevice | null {
    let gl: WebGL2RenderingContext | null;
    try {
      gl = canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
        failIfMajorPerformanceCaveat: true,
      });
    } catch {
      gl = null;
    }
    return gl ? new GpuDevice(canvas, gl) : null;
  }

  get lost(): boolean {
    return this.contextLost || this.gl.isContextLost();
  }

  /** Subscribes to context loss/restoration; returns the unsubscribe function. */
  onContext(events: DeviceEvents): () => void {
    const lost = (event: Event): void => {
      event.preventDefault(); // allows restoration
      this.contextLost = true;
      events.lost();
    };
    const restored = (): void => {
      this.contextLost = false;
      events.restored();
    };
    this.canvas.addEventListener('webglcontextlost', lost);
    this.canvas.addEventListener('webglcontextrestored', restored);
    const off = (): void => {
      this.canvas.removeEventListener('webglcontextlost', lost);
      this.canvas.removeEventListener('webglcontextrestored', restored);
    };
    this.listeners.push(off);
    return off;
  }

  scope(): ResourceScope {
    const scope = new ResourceScope(this.gl);
    this.scopes.add(scope);
    return scope;
  }

  /** Live resources over all scopes (for leak tests). */
  get resourceCount(): number {
    let count = 0;
    for (const scope of this.scopes) count += scope.size;
    return count;
  }

  /** Sets the drawing buffer to `css × pixelRatio`; returns whether it changed. */
  resize(cssWidth: number, cssHeight: number, pixelRatio: number): boolean {
    const width = Math.max(1, Math.round(cssWidth * pixelRatio));
    const height = Math.max(1, Math.round(cssHeight * pixelRatio));
    if (this.canvas.width === width && this.canvas.height === height) return false;
    this.canvas.width = width;
    this.canvas.height = height;
    return true;
  }

  /** Releases every resource and the context itself (frees GPU memory immediately). */
  dispose(): void {
    if (this.released) return;
    this.released = true;
    for (const scope of this.scopes) scope.dispose();
    this.scopes.clear();
    for (const off of this.listeners.splice(0)) off();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
