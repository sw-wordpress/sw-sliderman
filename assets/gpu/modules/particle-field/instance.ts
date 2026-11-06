import { QUALITY_PROFILES, type QualityTier } from '@gpu/core/quality';
import { blend, ease } from '@gpu/core/transition';
import type {
  EffectEvent,
  EffectInstance,
  EffectState,
  FrameInput,
  RenderFrame,
  TransitionOptions,
  Viewport,
} from '@gpu/core/types';
import type { GpuDevice, ResourceScope } from '@gpu/device/webgl2';
import { cameraAt, pointerOnPlane } from './camera';
import { RENDER_FRAGMENT, RENDER_VERTEX, UPDATE_FRAGMENT, UPDATE_VERTEX } from './shaders';
import {
  STREAM,
  SPAWN_SHAPE_ID,
  VELOCITY_MODE_ID,
  spawnPosition,
  spawnVelocity,
  unit,
} from './spawn';
import type { ParticleParams, Vec3 } from './types';
import {
  hexToRgb,
  operatorUniforms,
  spawnUniforms,
  type OperatorUniforms,
  type SpawnUniforms,
} from './uniforms';

const FLOATS = 4;
const STYLE_ID = { 'soft-disc': 0, glow: 1, pixel: 2 } as const;
const COLOR_MODE_ID = { solid: 0, speed: 1, life: 2, palette: 3, image: 4 } as const;
const POINTER_MODE_ID = { none: 0, repel: 1, attract: 2, swirl: 3, magnet: 4 } as const;
const IMPULSE_DECAY = 3;

type Params = ParticleParams;
type Side = 0 | 1;

interface Derived {
  readonly operators: OperatorUniforms;
  readonly spawn: SpawnUniforms;
  readonly color: Float32Array;
  readonly color2: Float32Array;
  readonly palette: Float32Array;
  readonly paletteSize: number;
}

function derive(params: ParticleParams, aspect: number): Derived {
  const palette = new Float32Array(12);
  params.appearance.palette.slice(0, 4).forEach((hex, i) => palette.set(hexToRgb(hex), i * 3));
  return {
    operators: operatorUniforms(params.operators),
    spawn: spawnUniforms(params, aspect),
    color: Float32Array.from(hexToRgb(params.appearance.color)),
    color2: Float32Array.from(hexToRgb(params.appearance.color2)),
    palette,
    paletteSize: Math.max(1, Math.min(4, params.appearance.palette.length)),
  };
}
type Pair<T> = readonly [T, T];

/** All GPU objects of one particle system; replaced as a whole when the particles are rebuilt. */
interface Resources {
  readonly updateProgram: WebGLProgram;
  readonly renderProgram: WebGLProgram;
  readonly bufferP: Pair<WebGLBuffer>;
  readonly bufferV: Pair<WebGLBuffer>;
  readonly bufferH: WebGLBuffer;
  readonly bufferC: WebGLBuffer;
  readonly updateVao: Pair<WebGLVertexArrayObject>;
  readonly renderVao: Pair<WebGLVertexArrayObject>;
  readonly feedback: Pair<WebGLTransformFeedback>;
}

export interface ImageTarget {
  /** Home positions (xyz per particle) and colours (rgba per particle), already sized to the count. */
  readonly home: Float32Array;
  readonly color: Float32Array;
}

export interface InstanceOptions {
  readonly device: GpuDevice;
  readonly seed: number;
  readonly params: Params;
  readonly quality: QualityTier;
  readonly type: string;
  readonly schemaVersion: number;
  /** Optional image reconstruction target (G5). */
  readonly image?: ImageTarget | null;
  /** Size of the effect area at creation: the "whole area" shape and images are fitted to its aspect. */
  readonly viewport?: Viewport;
  /**
   * Builds the image targets again (new aspect ratio or changed image settings); null: no image.
   * Without it the targets given in `image` stay as they are.
   */
  readonly rebuildImage?: (aspect: number, params: ParticleParams) => ImageTarget | null;
}

const aspectOf = (viewport: Viewport | undefined): number =>
  viewport && viewport.height > 0 ? viewport.width / viewport.height : 16 / 9;

const merge = (base: unknown, patch: unknown): unknown => {
  if (
    typeof base === 'object' &&
    base !== null &&
    !Array.isArray(base) &&
    typeof patch === 'object' &&
    patch !== null &&
    !Array.isArray(patch)
  ) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(patch))
      out[key] = key in out ? merge(out[key], value) : value;
    return out;
  }
  return patch;
};

/**
 * GPU-resident particle system: positions and velocities live in ping-pong buffers that a vertex
 * shader updates by transform feedback (no readback, no CPU per particle per frame); drawing is
 * instanced from the same buffers.
 */
export class ParticleInstance implements EffectInstance<Params> {
  private readonly gl: WebGL2RenderingContext;
  private scope: ResourceScope;
  private params: Params;
  private readonly seed: number;
  private tier: QualityTier;
  private res: Resources;
  private current: Side = 0;
  /** Values derived from the parameters; recomputed only when they change, never per frame. */
  private derived: Derived;
  private stepIndex = 0;
  private activeCount = 0;
  private impulse = 0;
  private impulseCenter: Vec3 = [0, 0, 0];
  private viewport: Viewport = { width: 1, height: 1, pixelRatio: 1 };
  private time = 0;
  private disposed = false;
  private transition: {
    from: Params;
    to: Params;
    elapsed: number;
    duration: number;
    easing: Parameters<typeof ease>[0];
  } | null = null;
  private pointerWorld: Vec3 | null = null;
  private lastPointerWorld: Vec3 | null = null;
  private pointerDir: Vec3 = [1, 0, 0];
  private pointerBoost = 1;
  private uniformLocations = new Map<string, WebGLUniformLocation | null>();
  private image: ImageTarget | null;
  /** Aspect ratio the particles were laid out for; a clearly different one rebuilds them. */
  private aspect: number;
  /** Parameters the current particles were built from (structural changes are detected against them). */
  private built: Params;

  constructor(private readonly options: InstanceOptions) {
    this.gl = options.device.gl;
    this.scope = options.device.scope();
    this.params = options.params;
    this.aspect = aspectOf(options.viewport);
    this.derived = derive(options.params, this.aspect);
    this.built = options.params;
    this.seed = options.seed >>> 0;
    this.tier = options.quality;
    this.image = options.image ?? null;
    this.res = this.build();
  }

  // -------------------------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------------------------

  private build(): Resources {
    const gl = this.gl;
    const scope = this.scope;
    const updateProgram = scope.program(UPDATE_VERTEX, UPDATE_FRAGMENT, {
      varyings: ['vP', 'vV'],
      separateAttribs: true,
    });
    const renderProgram = scope.program(RENDER_VERTEX, RENDER_FRAGMENT);
    const count = this.params.count;
    const { position, velocity, home, color } = this.initialData(count);
    const dynamic = gl.DYNAMIC_COPY;
    const bufferP: Pair<WebGLBuffer> = [
      scope.buffer(position, dynamic),
      scope.buffer(position, dynamic), // both sides start initialised so a raised quality tier finds valid particles
    ];
    const bufferV: Pair<WebGLBuffer> = [
      scope.buffer(velocity, dynamic),
      scope.buffer(velocity, dynamic),
    ];
    const bufferH = scope.buffer(home, gl.STATIC_DRAW);
    const bufferC = scope.buffer(color, gl.STATIC_DRAW);
    const side = (
      index: Side,
    ): {
      update: WebGLVertexArrayObject;
      render: WebGLVertexArrayObject;
      tf: WebGLTransformFeedback;
    } => {
      const update = scope.vertexArray();
      gl.bindVertexArray(update);
      this.attribute(0, bufferP[index], 0);
      this.attribute(1, bufferV[index], 0);
      this.attribute(2, bufferH, 0);
      const render = scope.vertexArray();
      gl.bindVertexArray(render);
      this.attribute(0, bufferP[index], 1);
      this.attribute(1, bufferV[index], 1);
      this.attribute(2, bufferH, 1);
      this.attribute(3, bufferC, 1);
      const tf = scope.transformFeedback();
      const other: Side = index === 0 ? 1 : 0;
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, bufferP[other]);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, bufferV[other]);
      return { update, render, tf };
    };
    const a = side(0);
    const b = side(1);
    gl.bindVertexArray(null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.current = 0;
    this.stepIndex = 0;
    this.activeCount = this.countFor(this.tier, this.params.count);
    return {
      updateProgram,
      renderProgram,
      bufferP,
      bufferV,
      bufferH,
      bufferC,
      updateVao: [a.update, b.update],
      renderVao: [a.render, b.render],
      feedback: [a.tf, b.tf],
    };
  }

  private attribute(location: number, buffer: WebGLBuffer, divisor: number): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, FLOATS, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(location, divisor);
  }

  /** Never more than the buffers hold: during a transition `params.count` may exceed `built.count`. */
  private countFor(
    tier: QualityTier,
    base = Math.min(this.params.count, this.built.count),
  ): number {
    return Math.max(1, Math.floor(base * QUALITY_PROFILES[tier].countScale));
  }

  /** Initial state from the CPU spawn functions (the same hash as the shader, step 0). */
  private initialData(count: number): {
    position: Float32Array;
    velocity: Float32Array;
    home: Float32Array;
    color: Float32Array;
  } {
    const { spawn, lifecycle } = this.params;
    const position = new Float32Array(count * FLOATS);
    const velocity = new Float32Array(count * FLOATS);
    const home = new Float32Array(count * FLOATS);
    const color = new Float32Array(count * FLOATS).fill(1);
    const lifeMin = Math.min(lifecycle.minSeconds, lifecycle.maxSeconds);
    const lifeMax = Math.max(lifecycle.minSeconds, lifecycle.maxSeconds);
    for (let i = 0; i < count; i++) {
      const p = spawnPosition(
        spawn.shape,
        this.seed,
        i,
        0,
        spawn.radius,
        spawn.size,
        spawn.position,
        this.derived.spawn.view,
      );
      const rel: Vec3 = [
        p[0] - spawn.position[0],
        p[1] - spawn.position[1],
        p[2] - spawn.position[2],
      ];
      const v = spawnVelocity(spawn.velocity.mode, spawn.velocity.speed, rel, this.seed, i, 0);
      const life = lifeMin + (lifeMax - lifeMin) * unit(this.seed, i, STREAM.life, 0);
      const k = i * FLOATS;
      const target = this.image;
      const h: Vec3 = target
        ? [target.home[k] ?? p[0], target.home[k + 1] ?? p[1], target.home[k + 2] ?? p[2]]
        : p;
      // An image either starts assembled ("rest") or scatters from the spawn shape and springs home.
      const start = target && this.params.image.assemble === 'rest' ? h : p;
      position.set(
        [
          start[0],
          start[1],
          start[2],
          lifecycle.mode === 'emitter' ? life * unit(this.seed, i, STREAM.age, 0) : 0,
        ],
        k,
      );
      velocity.set([v[0], v[1], v[2], life], k);
      home.set([h[0], h[1], h[2], 0], k);
      if (target) color.set(target.color.subarray(k, k + 4), k);
    }
    return { position, velocity, home, color };
  }

  // -------------------------------------------------------------------------------------------
  // EffectInstance
  // -------------------------------------------------------------------------------------------

  resize(viewport: Viewport): void {
    this.viewport = viewport;
    this.camera = null; // the next draw projects with the new aspect ratio, even without an update()
    const aspect = aspectOf(viewport);
    if (Math.abs(aspect - this.aspect) / this.aspect <= 0.08) return;
    // The area changed clearly (e.g. another device size): lay the particles out for it again.
    this.aspect = aspect;
    this.derived = derive(this.params, aspect);
    if (this.options.rebuildImage) this.image = this.options.rebuildImage(aspect, this.params);
    this.reinitialise();
  }

  setQuality(tier: QualityTier): void {
    this.tier = tier;
    this.activeCount = this.countFor(tier);
  }

  setParams(patch: Partial<Params>): void {
    this.applyParams(merge(this.params, patch) as Params);
  }

  handleEvent(event: EffectEvent): void {
    if (event.type === 'burst' || event.type === 'strike') {
      this.impulse = (event.intensity ?? 1) * 8;
      this.impulseCenter = [0, 0, 0];
    } else if (event.type === 'reset') {
      this.reinitialise();
    }
  }

  captureState(): EffectState {
    return {
      type: this.options.type,
      schemaVersion: this.options.schemaVersion,
      seed: this.seed,
      params: JSON.parse(JSON.stringify(this.params)) as Record<string, unknown>,
    };
  }

  transitionTo(state: EffectState, options: TransitionOptions): void {
    const target = state.params as unknown as Params;
    this.transition = {
      from: this.params,
      to: target,
      elapsed: 0,
      duration: Math.max(options.durationSeconds, 1e-3),
      easing: options.easing ?? 'ease-in-out',
    };
  }

  update(input: FrameInput, steps: number): void {
    if (this.disposed) return;
    this.time = input.time;
    this.advanceTransition(input.deltaSeconds);
    const aspect = this.viewport.width / Math.max(this.viewport.height, 1);
    const camera = cameraAt(this.params.camera, this.time, aspect);
    this.pointerWorld = null;
    const pointer = input.pointer;
    const previousWorld = this.lastPointerWorld;
    if (pointer?.inside && this.params.interaction.mode !== 'none') {
      const ndcX = (pointer.x / Math.max(this.viewport.width, 1)) * 2 - 1;
      const ndcY = 1 - (pointer.y / Math.max(this.viewport.height, 1)) * 2;
      this.pointerWorld = pointerOnPlane(
        camera,
        this.params.camera.projection,
        ndcX,
        ndcY,
        aspect,
        this.params.camera.fov,
        this.params.camera.distance,
      );
      this.trackPointerMotion(previousWorld, this.pointerWorld, input.deltaSeconds);
    }
    this.lastPointerWorld = this.pointerWorld;
    this.camera = camera;
    this.runSteps(input.stepSeconds, steps, camera.normal);
    this.impulse *= Math.exp(-IMPULSE_DECAY * input.deltaSeconds);
    if (this.impulse < 0.01) this.impulse = 0;
  }

  private camera: ReturnType<typeof cameraAt> | null = null;

  render(frame: RenderFrame): void {
    if (this.disposed) return;
    const camera =
      this.camera ??
      cameraAt(
        this.params.camera,
        this.time,
        this.viewport.width / Math.max(this.viewport.height, 1),
      );
    const gl = this.gl;
    const p = this.params;
    const { appearance } = p;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    if (appearance.blend === 'additive') gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.res.renderProgram);
    const u = (name: string): WebGLUniformLocation | null =>
      this.location(this.res.renderProgram, name);
    gl.uniformMatrix4fv(u('uVP'), false, camera.viewProjection);
    gl.uniform2f(u('uViewport'), gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(u('uPixelRatio'), frame.input.viewport.pixelRatio);
    gl.uniform2f(u('uSize'), appearance.sizeMin, appearance.sizeMax);
    gl.uniform1f(u('uPerspective'), p.camera.projection === 'perspective' ? 1 : 0);
    gl.uniform1f(
      u('uFocal'),
      p.camera.distance / Math.max(Math.tan((p.camera.fov * Math.PI) / 360), 0.01) / 6,
    );
    gl.uniform1f(u('uOpacity'), appearance.opacity);
    gl.uniform1f(u('uDepthFade'), appearance.depthFade);
    gl.uniform1f(u('uEmitter'), p.lifecycle.mode === 'emitter' ? 1 : 0);
    gl.uniform1i(u('uColorMode'), COLOR_MODE_ID[appearance.colorMode]);
    gl.uniform3fv(u('uColor'), this.derived.color);
    gl.uniform3fv(u('uColor2'), this.derived.color2);
    gl.uniform3fv(u('uPalette'), this.derived.palette);
    gl.uniform1i(u('uPaletteSize'), this.derived.paletteSize);
    gl.uniform1ui(u('uSeed'), this.seed);
    gl.uniform1f(u('uSpeedRef'), 2);
    gl.uniform1i(u('uStyle'), STYLE_ID[appearance.style]);
    gl.bindVertexArray(this.res.renderVao[this.current]);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.activeCount);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  /** Number of particles currently simulated and drawn (quality tier applied). */
  get activeParticleCount(): number {
    return this.activeCount;
  }

  /**
   * Copies positions (xyz, age) and velocities (xyz, life) of the first `count` particles to the CPU.
   * For tests and tools only: it stalls the GPU, never call it in the frame loop.
   */
  readState(count = this.activeCount): { position: Float32Array; velocity: Float32Array } {
    const gl = this.gl;
    const n = Math.min(count, this.params.count) * FLOATS;
    const position = new Float32Array(n);
    const velocity = new Float32Array(n);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.res.bufferP[this.current]);
    gl.getBufferSubData(gl.ARRAY_BUFFER, 0, position);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.res.bufferV[this.current]);
    gl.getBufferSubData(gl.ARRAY_BUFFER, 0, velocity);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return { position, velocity };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scope.dispose();
    this.uniformLocations.clear();
  }

  // -------------------------------------------------------------------------------------------

  private location(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    const key = `${program === this.res.updateProgram ? 'u' : 'r'}:${name}`;
    if (!this.uniformLocations.has(key))
      this.uniformLocations.set(key, this.gl.getUniformLocation(program, name));
    return this.uniformLocations.get(key) ?? null;
  }

  /** The dipole axis follows the pointer's motion; a stationary pointer keeps the last axis. */
  private trackPointerMotion(previous: Vec3 | null, current: Vec3, deltaSeconds: number): void {
    if (!previous) {
      this.pointerBoost = 1;
      return;
    }
    const dx = current[0] - previous[0];
    const dy = current[1] - previous[1];
    const dz = current[2] - previous[2];
    const length = Math.hypot(dx, dy, dz);
    if (length > 1e-5) this.pointerDir = [dx / length, dy / length, dz / length];
    const speed = length / Math.max(deltaSeconds, 1e-3);
    // Faster movement pulls harder (world units per second, softened and capped).
    this.pointerBoost = 1 + this.params.interaction.speedBoost * Math.min(speed / 4, 2);
  }

  private runSteps(stepSeconds: number, steps: number, normal: Vec3): void {
    const gl = this.gl;
    if (steps <= 0) return;
    const p = this.params;
    const { operators: op, spawn } = this.derived;
    gl.useProgram(this.res.updateProgram);
    const u = (name: string): WebGLUniformLocation | null =>
      this.location(this.res.updateProgram, name);
    gl.uniform1f(u('uDt'), stepSeconds);
    gl.uniform1ui(u('uSeed'), this.seed);
    gl.uniform1i(u('uShape'), spawn.shape);
    gl.uniform1f(u('uRadius'), spawn.radius);
    gl.uniform3fv(u('uSize'), spawn.size);
    gl.uniform3fv(u('uCenter'), spawn.center);
    gl.uniform2fv(u('uView'), spawn.view);
    gl.uniform1i(u('uVelMode'), spawn.velocityMode);
    gl.uniform1f(u('uVelSpeed'), spawn.velocitySpeed);
    gl.uniform1f(u('uEmitter'), spawn.emitter);
    gl.uniform2f(u('uLife'), spawn.lifeMin, spawn.lifeMax);
    gl.uniform1f(u('uDrag'), op.drag);
    gl.uniform4fv(u('uSpring'), op.spring);
    gl.uniform4fv(u('uVortexA'), op.vortexA);
    gl.uniform4fv(u('uVortexB'), op.vortexB);
    gl.uniform1f(u('uVortexOn'), op.vortexOn);
    gl.uniform4fv(u('uFlow'), op.flow);
    gl.uniform4fv(u('uWells'), op.wells);
    gl.uniform1f(u('uSpeedLimit'), op.speedLimit);
    gl.uniform2fv(u('uBounds'), op.bounds);
    const pointer = this.pointerWorld;
    gl.uniform4f(
      u('uPointer'),
      pointer?.[0] ?? 0,
      pointer?.[1] ?? 0,
      pointer?.[2] ?? 0,
      pointer ? 1 : 0,
    );
    gl.uniform4f(
      u('uPointerParams'),
      POINTER_MODE_ID[p.interaction.mode],
      p.interaction.radius,
      p.interaction.strength * (p.interaction.mode === 'magnet' ? this.pointerBoost : 1),
      p.interaction.polarity,
    );
    gl.uniform3fv(u('uPointerN'), normal);
    gl.uniform3fv(u('uPointerDir'), this.pointerDir);
    gl.uniform4f(
      u('uImpulse'),
      this.impulseCenter[0],
      this.impulseCenter[1],
      this.impulseCenter[2],
      this.impulse,
    );
    gl.enable(gl.RASTERIZER_DISCARD);
    for (let i = 0; i < steps; i++) {
      gl.uniform1f(u('uTime'), this.time);
      gl.uniform1ui(u('uStep'), this.stepIndex++ >>> 0);
      gl.bindVertexArray(this.res.updateVao[this.current]);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.res.feedback[this.current]);
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, this.activeCount);
      gl.endTransformFeedback();
      this.current = this.current === 0 ? 1 : 0;
    }
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindVertexArray(null);
    gl.disable(gl.RASTERIZER_DISCARD);
  }

  private advanceTransition(deltaSeconds: number): void {
    const transition = this.transition;
    if (!transition) return;
    transition.elapsed += deltaSeconds;
    const t = Math.min(transition.elapsed / transition.duration, 1);
    this.applyParams(
      blend(transition.from, transition.to, ease(transition.easing, t)) as Params,
      t >= 1,
    );
    if (t >= 1) this.transition = null;
  }

  /**
   * Structural changes (count, spawn, lifecycle mode, image settings) rebuild the particles;
   * everything else only changes uniforms. While a transition runs only the uniforms follow; the
   * rebuild happens once at its end.
   */
  private applyParams(next: Params, final = true): void {
    this.params = next;
    this.derived = derive(next, this.aspect);
    const before = this.built;
    // The image targets depend on the image settings and on the visible area (camera distance and fov).
    const imageChanged =
      JSON.stringify(before.image) !== JSON.stringify(next.image) ||
      before.camera.distance !== next.camera.distance ||
      before.camera.fov !== next.camera.fov;
    const structural =
      before.count !== next.count ||
      JSON.stringify(before.spawn) !== JSON.stringify(next.spawn) ||
      before.lifecycle.mode !== next.lifecycle.mode ||
      imageChanged;
    if (structural && final) {
      if ((imageChanged || before.count !== next.count) && this.options.rebuildImage)
        this.image = this.options.rebuildImage(this.aspect, next);
      this.reinitialise();
    } else this.activeCount = this.countFor(this.tier);
  }

  private reinitialise(): void {
    this.scope.dispose();
    this.uniformLocations.clear();
    this.scope = this.options.device.scope();
    this.res = this.build();
    this.built = this.params;
  }
}

// Re-exported so tests can assert that the shader tables and the CPU reference agree on ids.
export { SPAWN_SHAPE_ID, VELOCITY_MODE_ID };
