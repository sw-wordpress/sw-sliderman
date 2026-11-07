import type { Vec3 } from './types';

/** Column-major 4×4 matrices (WebGL). Pure functions; no allocation beyond the result. */
export type Mat4 = Float32Array;

export function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function orthographic(halfHeight: number, aspect: number, near: number, far: number): Mat4 {
  const out = new Float32Array(16);
  out[0] = 1 / (halfHeight * aspect);
  out[5] = 1 / halfHeight;
  out[10] = -2 / (far - near);
  out[14] = -(far + near) / (far - near);
  out[15] = 1;
  return out;
}

export function lookAt(eye: Vec3, target: Vec3, up: Vec3 = [0, 1, 0]): Mat4 {
  const z = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  const out = new Float32Array(16);
  out[0] = x[0];
  out[1] = y[0];
  out[2] = z[0];
  out[4] = x[1];
  out[5] = y[1];
  out[6] = z[1];
  out[8] = x[2];
  out[9] = y[2];
  out[10] = z[2];
  out[12] = -dot(x, eye);
  out[13] = -dot(y, eye);
  out[14] = -dot(z, eye);
  out[15] = 1;
  return out;
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] ?? 0) * (b[column * 4 + k] ?? 0);
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

export function transform(
  m: Mat4,
  v: readonly [number, number, number, number],
): [number, number, number, number] {
  const at = (r: number, c: number): number => m[c * 4 + r] ?? 0;
  return [0, 1, 2, 3].map(
    (r) => at(r, 0) * v[0] + at(r, 1) * v[1] + at(r, 2) * v[2] + at(r, 3) * v[3],
  ) as [number, number, number, number];
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

export interface CameraParams {
  readonly projection: 'perspective' | 'orthographic';
  readonly distance: number;
  readonly fov: number;
  readonly orbitSpeed: number;
  readonly tilt: number;
}

export interface CameraState {
  readonly viewProjection: Mat4;
  readonly eye: Vec3;
  /** Plane normal facing the camera through the origin (the interaction plane). */
  readonly normal: Vec3;
}

/** Orbit camera around the origin: yaw advances with time, `tilt` raises it. */
export function cameraAt(params: CameraParams, timeSeconds: number, aspect: number): CameraState {
  const yaw = params.orbitSpeed * timeSeconds;
  const eye: Vec3 = [
    params.distance * Math.sin(yaw) * Math.cos(params.tilt),
    params.distance * Math.sin(params.tilt),
    params.distance * Math.cos(yaw) * Math.cos(params.tilt),
  ];
  const fovY = (params.fov * Math.PI) / 180;
  const projection =
    params.projection === 'perspective'
      ? perspective(fovY, aspect, 0.05, params.distance * 4 + 50)
      : orthographic(params.distance * Math.tan(fovY / 2), aspect, 0.05, params.distance * 4 + 50);
  const normal = normalize(eye);
  return { viewProjection: multiply(projection, lookAt(eye, [0, 0, 0])), eye, normal };
}

/**
 * World position under a pointer: the ray through the pointer (NDC −1..1) meets the plane through the
 * origin that faces the camera. Used for pointer forces.
 */
export function pointerOnPlane(
  camera: CameraState,
  projection: 'perspective' | 'orthographic',
  ndcX: number,
  ndcY: number,
  aspect: number,
  fov: number,
  distance: number,
): Vec3 {
  const normal = camera.normal;
  const forward: Vec3 = [-normal[0], -normal[1], -normal[2]];
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const half = Math.tan((fov * Math.PI) / 360);
  if (projection === 'orthographic') {
    const h = distance * half;
    return [
      right[0] * ndcX * h * aspect + up[0] * ndcY * h,
      right[1] * ndcX * h * aspect + up[1] * ndcY * h,
      right[2] * ndcX * h * aspect + up[2] * ndcY * h,
    ];
  }
  const dir: Vec3 = [
    forward[0] + right[0] * ndcX * half * aspect + up[0] * ndcY * half,
    forward[1] + right[1] * ndcX * half * aspect + up[1] * ndcY * half,
    forward[2] + right[2] * ndcX * half * aspect + up[2] * ndcY * half,
  ];
  const denominator = dot(dir, normal);
  if (Math.abs(denominator) < 1e-6) return [0, 0, 0];
  const t = -dot(camera.eye, normal) / denominator;
  return [camera.eye[0] + dir[0] * t, camera.eye[1] + dir[1] * t, camera.eye[2] + dir[2] * t];
}
