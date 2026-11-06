/**
 * GLSL ES 3.00 sources. Hash and spawn functions mirror core/rng.ts and spawn.ts exactly (integer
 * PCG hash, same formulas) so that CPU reference and GPU agree; keep them in sync.
 */

const COMMON = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
const float TAU = 6.28318530717958647692;
uint pcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
uint hashAt(uint seed, uint index, uint stream) { return pcg(pcg(seed ^ (stream * 2654435761u)) + index); }
float unitAt(uint seed, uint index, uint stream, uint step) {
  return float(hashAt(seed + step * 2654435761u, index, stream) >> 8u) / 16777216.0;
}
`;

export const UPDATE_VERTEX = /* glsl */ `${COMMON}
layout(location = 0) in vec4 aP; // xyz position, w age
layout(location = 1) in vec4 aV; // xyz velocity, w lifetime
layout(location = 2) in vec4 aH; // xyz home
out vec4 vP;
out vec4 vV;

uniform float uDt;
uniform float uTime;
uniform uint uSeed;
uniform uint uStep;
// spawn
uniform int uShape;
uniform float uRadius;
uniform vec3 uSize;
uniform vec3 uCenter;
uniform vec2 uView;         // visible area times the coverage (shape "view")
uniform int uVelMode;
uniform float uVelSpeed;
uniform float uEmitter;
uniform vec2 uLife;
// operators
uniform float uDrag;
uniform vec4 uSpring;
uniform vec4 uVortexA;
uniform vec4 uVortexB;
uniform float uVortexOn;
uniform vec4 uFlow;
uniform vec4 uWells[3];
uniform float uSpeedLimit;
uniform vec2 uBounds;
// interaction
uniform vec4 uPointer;      // xyz world position, w active
uniform vec4 uPointerParams; // x mode (1 repel, 2 attract, 3 swirl), y radius, z strength
uniform vec3 uPointerN;
uniform vec3 uPointerDir;   // unit direction of the pointer's motion (magnet dipole axis)
uniform vec4 uImpulse;      // xyz centre, w strength

vec3 shapePosition(int shape, float u1, float u2, float u3) {
  if (shape == 1) { float r = uRadius * sqrt(u1); float a = TAU * u2; return vec3(r * cos(a), r * sin(a), 0.0); }
  if (shape == 2) { float a = TAU * u1; return vec3(uRadius * cos(a), uRadius * sin(a), 0.0); }
  if (shape == 3 || shape == 4) {
    float z = 2.0 * u1 - 1.0; float a = TAU * u2; float s = sqrt(max(0.0, 1.0 - z * z));
    float r = shape == 4 ? uRadius * pow(u3, 1.0 / 3.0) : uRadius;
    return vec3(r * s * cos(a), r * s * sin(a), r * z);
  }
  if (shape == 5) return vec3((u1 - 0.5) * uSize.x, (u2 - 0.5) * uSize.y, (u3 - 0.5) * uSize.z);
  if (shape == 6) return vec3((u1 - 0.5) * uSize.x, 0.0, 0.0);
  if (shape == 7) return vec3((u1 - 0.5) * uView.x, (u2 - 0.5) * uView.y, (u3 - 0.5) * uSize.z);
  return vec3(0.0);
}

vec3 spawnVelocity(vec3 rel, uint index, uint step) {
  if (uVelMode == 0 || uVelSpeed == 0.0) return vec3(0.0);
  if (uVelMode == 1) return normalize(rel + vec3(0.0, 1e-7, 0.0)) * uVelSpeed;
  if (uVelMode == 2) { float l = max(length(rel.xz), 1e-6); return vec3(-rel.z / l, 0.0, rel.x / l) * uVelSpeed; }
  float z = 2.0 * unitAt(uSeed, index, 7u, step) - 1.0; float a = TAU * unitAt(uSeed, index, 8u, step);
  float s = sqrt(max(0.0, 1.0 - z * z));
  return vec3(s * cos(a), s * sin(a), z) * uVelSpeed;
}

// Value noise from the integer hash, and a divergence-free curl field (finite differences).
float lattice(ivec3 c) { return float(pcg(uint(c.x) * 73856093u ^ uint(c.y) * 19349663u ^ uint(c.z) * 83492791u ^ uSeed) >> 8u) / 16777216.0; }
float noise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); vec3 w = f * f * (3.0 - 2.0 * f);
  ivec3 c = ivec3(i);
  float x00 = mix(lattice(c), lattice(c + ivec3(1, 0, 0)), w.x);
  float x10 = mix(lattice(c + ivec3(0, 1, 0)), lattice(c + ivec3(1, 1, 0)), w.x);
  float x01 = mix(lattice(c + ivec3(0, 0, 1)), lattice(c + ivec3(1, 0, 1)), w.x);
  float x11 = mix(lattice(c + ivec3(0, 1, 1)), lattice(c + ivec3(1, 1, 1)), w.x);
  return mix(mix(x00, x10, w.y), mix(x01, x11, w.y), w.z) * 2.0 - 1.0;
}
vec3 potential(vec3 p) { return vec3(noise3(p), noise3(p + vec3(31.4, 17.7, 5.9)), noise3(p + vec3(7.3, 43.1, 21.2))); }
vec3 curl(vec3 p) {
  const float e = 0.1;
  vec3 dx = potential(p + vec3(e, 0.0, 0.0)) - potential(p - vec3(e, 0.0, 0.0));
  vec3 dy = potential(p + vec3(0.0, e, 0.0)) - potential(p - vec3(0.0, e, 0.0));
  vec3 dz = potential(p + vec3(0.0, 0.0, e)) - potential(p - vec3(0.0, 0.0, e));
  return vec3(dy.z - dz.y, dz.x - dx.z, dx.y - dy.x) / (2.0 * e);
}

void main() {
  uint index = uint(gl_VertexID);
  vec3 p = aP.xyz; vec3 v = aV.xyz; float age = aP.w; float life = aV.w;
  vec3 f = vec3(0.0);

  if (uSpring.w > 0.5) {
    vec3 s = uSpring.x * (aH.xyz - p) - uSpring.y * v;
    float l = length(s);
    if (l > uSpring.z) s *= uSpring.z / l;
    f += s;
  }
  if (uVortexOn > 0.5) {
    vec3 axis = uVortexA.xyz;
    vec3 rel = p - uVortexB.xyz;
    vec3 radial = rel - axis * dot(rel, axis);
    float d = length(radial);
    f += uVortexA.w * cross(axis, radial) / (1.0 + d) - uVortexB.w * radial;
  }
  if (uFlow.w > 0.5) f += uFlow.y * curl(p * uFlow.x + vec3(0.0, 0.0, uTime * uFlow.z));
  for (int i = 0; i < 3; i++) {
    if (uWells[i].w != 0.0) {
      vec3 d = uWells[i].xyz - p;
      float r2 = dot(d, d) + 0.01;
      f += uWells[i].w * d / (r2 * sqrt(r2));
    }
  }
  if (uPointer.w > 0.5 && uPointerParams.x > 0.5) {
    vec3 d = p - uPointer.xyz;
    float dist = length(d);
    float fall = 1.0 - smoothstep(0.0, uPointerParams.y, dist);
    vec3 dir = d / (dist + 1e-4);
    if (uPointerParams.x < 1.5) f += dir * uPointerParams.z * fall;
    else if (uPointerParams.x < 2.5) f -= dir * uPointerParams.z * fall;
    else if (uPointerParams.x < 3.5) f += cross(uPointerN, dir) * uPointerParams.z * fall;
    else {
      // Softened dipole field: B = (3 (m.r) r - m) / r^3 drives particles along curved field lines.
      float s = uPointerParams.y;
      vec3 m = uPointerDir;
      float d2 = dist * dist + 0.25 * s * s;
      vec3 B = (3.0 * dot(m, dir) * dir - m) * (s * s * s) / (d2 * sqrt(d2));
      f += B * uPointerParams.z * uPointerParams.w * fall;
    }
  }
  if (uImpulse.w > 0.0) {
    vec3 d = p - uImpulse.xyz;
    f += normalize(d + vec3(0.0, 1e-5, 0.0)) * uImpulse.w / (1.0 + length(d));
  }

  v += f * uDt;
  if (uSpeedLimit > 0.0) { float s = length(v); if (s > uSpeedLimit) v *= uSpeedLimit / s; }
  v *= exp(-uDrag * uDt);
  p += v * uDt;
  age += uDt;

  bool respawn = false;
  if (uBounds.x > 0.5) {
    float len = length(p);
    if (len > uBounds.y) {
      if (uBounds.x < 1.5) p *= -uBounds.y * 0.98 / len;
      else if (uBounds.x < 2.5) {
        vec3 n = p / len;
        float along = dot(v, n);
        if (along > 0.0) v = (v - 2.0 * along * n) * 0.9;
        p = n * uBounds.y;
      } else respawn = true;
    }
  }
  if (uEmitter > 0.5 && age >= life) respawn = true;
  if (respawn) {
    p = shapePosition(uShape, unitAt(uSeed, index, 1u, uStep), unitAt(uSeed, index, 2u, uStep), unitAt(uSeed, index, 3u, uStep)) + uCenter;
    v = spawnVelocity(p - uCenter, index, uStep);
    age = 0.0;
    life = mix(uLife.x, uLife.y, unitAt(uSeed, index, 5u, uStep));
  }
  vP = vec4(p, age);
  vV = vec4(v, life);
  gl_Position = vec4(0.0);
}
`;

export const UPDATE_FRAGMENT = /* glsl */ `#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(0.0); }
`;

export const RENDER_VERTEX = /* glsl */ `${COMMON}
layout(location = 0) in vec4 iP;
layout(location = 1) in vec4 iV;
layout(location = 2) in vec4 iH; // xyz home (unused here)
layout(location = 3) in vec4 iC; // rgba from an image (colour mode "image")
uniform mat4 uVP;
uniform vec2 uViewport;
uniform float uPixelRatio;
uniform vec2 uSize;        // min, max diameter in CSS px
uniform float uPerspective; // 1: scale with depth
uniform float uFocal;
uniform float uOpacity;
uniform float uDepthFade;
uniform float uEmitter;
uniform int uColorMode;     // 0 solid, 1 speed, 2 life, 3 palette, 4 image
uniform vec3 uColor;
uniform vec3 uColor2;
uniform vec3 uPalette[4];
uniform int uPaletteSize;
uniform uint uSeed;
uniform float uSpeedRef;
out vec2 vUv;
out vec4 vColor;

void main() {
  vec2 corner = vec2(float(gl_VertexID & 1) * 2.0 - 1.0, float((gl_VertexID >> 1) & 1) * 2.0 - 1.0);
  uint particle = uint(gl_InstanceID);
  float r = float(hashAt(uSeed, particle, 4u) >> 8u) / 16777216.0;
  vec4 clip = uVP * vec4(iP.xyz, 1.0);
  float depthScale = uPerspective > 0.5 ? uFocal / max(clip.w, 0.05) : 1.0;
  float size = mix(uSize.x, uSize.y, r) * uPixelRatio * depthScale;
  clip.xy += corner * size / uViewport * clip.w;
  gl_Position = clip;
  vUv = corner;
  float t = 0.0;
  vec3 color = uColor;
  if (uColorMode == 1) { t = clamp(length(iV.xyz) / uSpeedRef, 0.0, 1.0); color = mix(uColor, uColor2, t); }
  else if (uColorMode == 2) { t = clamp(iP.w / max(iV.w, 1e-3), 0.0, 1.0); color = mix(uColor, uColor2, t); }
  else if (uColorMode == 3) { int k = int(float(hashAt(uSeed, particle, 9u) >> 8u) / 16777216.0 * float(uPaletteSize)); color = uPalette[min(k, 3)]; }
  else if (uColorMode == 4) color = iC.rgb;
  float alpha = uOpacity;
  if (uEmitter > 0.5) alpha *= sin(3.14159265 * clamp(iP.w / max(iV.w, 1e-3), 0.0, 1.0));
  float ndcDepth = clamp(clip.z / max(clip.w, 1e-3) * 0.5 + 0.5, 0.0, 1.0);
  alpha *= mix(1.0, 1.0 - ndcDepth, uDepthFade);
  vColor = vec4(color, alpha);
}
`;

export const RENDER_FRAGMENT = /* glsl */ `#version 300 es
precision mediump float;
in vec2 vUv;
in vec4 vColor;
uniform int uStyle; // 0 soft disc, 1 glow, 2 pixel
out vec4 o;
void main() {
  float d = length(vUv);
  float a = 1.0;
  if (uStyle == 0) a = 1.0 - smoothstep(0.35, 1.0, d);
  else if (uStyle == 1) { a = max(0.0, 1.0 - d); a *= a; }
  if (uStyle != 2 && d > 1.0) discard;
  float alpha = vColor.a * a;
  o = vec4(vColor.rgb * alpha, alpha);
}
`;
