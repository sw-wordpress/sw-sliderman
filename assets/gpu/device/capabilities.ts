import type { BackendKind } from '../core/types';

/** What the browser offers; chosen by capability, never by user agent (ADR 0005). */
export interface Capabilities {
  /** Backend this build can use right now. */
  readonly backend: BackendKind;
  readonly webgl2: boolean;
  /** Float render targets (needed for GPU-resident simulation state). */
  readonly floatTargets: boolean;
  readonly maxTextureSize: number;
  /** WebGPU is reported but not used before G8. */
  readonly webgpu: boolean;
}

const NONE: Capabilities = {
  backend: 'none',
  webgl2: false,
  floatTargets: false,
  maxTextureSize: 0,
  webgpu: false,
};

/** Probes WebGL2 on a throw-away canvas and releases the probe context immediately. */
export function detectCapabilities(
  createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
  nav: { gpu?: unknown } = typeof navigator === 'undefined' ? {} : (navigator as { gpu?: unknown }),
): Capabilities {
  const webgpu = 'gpu' in nav && nav.gpu !== undefined;
  let gl: WebGL2RenderingContext | null;
  try {
    gl = createCanvas().getContext('webgl2', { failIfMajorPerformanceCaveat: true });
  } catch {
    gl = null;
  }
  if (!gl) return { ...NONE, webgpu };
  const floatTargets = gl.getExtension('EXT_color_buffer_float') !== null;
  const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return { backend: 'webgl2', webgl2: true, floatTargets, maxTextureSize, webgpu };
}
