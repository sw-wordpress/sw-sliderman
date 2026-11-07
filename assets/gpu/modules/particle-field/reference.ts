import { STREAM, spawnPosition, spawnVelocity, unit } from './spawn';
import type { OperatorUniforms, SpawnUniforms } from './uniforms';
import type { SpawnShape, Vec3, VelocityMode } from './types';

/**
 * CPU reference of the update shader for the deterministic operator subset (spring-home, vortex,
 * gravity wells, speed limit, drag, bounds, emitter respawn). It defines the intended behaviour; the
 * GPU result is compared against it in tests/e2e/gpu-particles.mjs. Flow field, pointer and impulse
 * forces have no reference (they use GPU-side noise) and are covered by invariants.
 */
export interface ReferenceState {
  readonly count: number;
  pos: Float32Array; // xyz
  vel: Float32Array; // xyz
  age: Float32Array;
  life: Float32Array;
  home: Float32Array; // xyz
}

export interface ReferenceConfig {
  readonly seed: number;
  readonly shape: SpawnShape;
  readonly velocityMode: VelocityMode;
  readonly spawn: SpawnUniforms;
  readonly operators: OperatorUniforms;
}

export function initialState(count: number, config: ReferenceConfig): ReferenceState {
  const { seed, spawn } = config;
  const state: ReferenceState = {
    count,
    pos: new Float32Array(count * 3),
    vel: new Float32Array(count * 3),
    age: new Float32Array(count),
    life: new Float32Array(count),
    home: new Float32Array(count * 3),
  };
  for (let i = 0; i < count; i++) {
    const p = spawnPosition(
      config.shape,
      seed,
      i,
      0,
      spawn.radius,
      spawn.size,
      spawn.center,
      spawn.view,
    );
    const rel: Vec3 = [p[0] - spawn.center[0], p[1] - spawn.center[1], p[2] - spawn.center[2]];
    const v = spawnVelocity(config.velocityMode, spawn.velocitySpeed, rel, seed, i, 0);
    state.pos.set(p, i * 3);
    state.home.set(p, i * 3);
    state.vel.set(v, i * 3);
    state.life[i] = spawn.lifeMin + (spawn.lifeMax - spawn.lifeMin) * unit(seed, i, STREAM.life, 0);
    state.age[i] = spawn.emitter ? at(state.life, i) * unit(seed, i, STREAM.age, 0) : 0;
  }
  return state;
}

const f = Math.fround;
/** Typed-array read that is a number even with noUncheckedIndexedAccess. */
const at = (array: Float32Array, index: number): number => array[index] ?? 0;

export function step(
  state: ReferenceState,
  config: ReferenceConfig,
  dt: number,
  stepIndex: number,
): void {
  const { operators: op, spawn, seed } = config;
  for (let i = 0; i < state.count; i++) {
    const k = i * 3;
    let px = at(state.pos, k),
      py = at(state.pos, k + 1),
      pz = at(state.pos, k + 2);
    let vx = at(state.vel, k),
      vy = at(state.vel, k + 1),
      vz = at(state.vel, k + 2);
    let fx = 0,
      fy = 0,
      fz = 0;
    if (op.spring[3] > 0.5) {
      let sx = op.spring[0] * (at(state.home, k) - px) - op.spring[1] * vx;
      let sy = op.spring[0] * (at(state.home, k + 1) - py) - op.spring[1] * vy;
      let sz = op.spring[0] * (at(state.home, k + 2) - pz) - op.spring[1] * vz;
      const l = Math.hypot(sx, sy, sz);
      if (l > op.spring[2]) {
        const s = op.spring[2] / l;
        sx *= s;
        sy *= s;
        sz *= s;
      }
      fx += sx;
      fy += sy;
      fz += sz;
    }
    if (op.vortexOn > 0.5) {
      const [ax, ay, az, strength] = op.vortexA;
      const rx = px - op.vortexB[0],
        ry = py - op.vortexB[1],
        rz = pz - op.vortexB[2];
      const along = rx * ax + ry * ay + rz * az;
      const qx = rx - ax * along,
        qy = ry - ay * along,
        qz = rz - az * along;
      const tx = ay * qz - az * qy,
        ty = az * qx - ax * qz,
        tz = ax * qy - ay * qx;
      const d = Math.hypot(qx, qy, qz);
      fx += (strength * tx) / (1 + d) - op.vortexB[3] * qx;
      fy += (strength * ty) / (1 + d) - op.vortexB[3] * qy;
      fz += (strength * tz) / (1 + d) - op.vortexB[3] * qz;
    }
    for (let w = 0; w < 3; w++) {
      const mass = at(op.wells, w * 4 + 3);
      if (mass === 0) continue;
      const dx = at(op.wells, w * 4) - px,
        dy = at(op.wells, w * 4 + 1) - py,
        dz = at(op.wells, w * 4 + 2) - pz;
      const r2 = dx * dx + dy * dy + dz * dz + 0.01;
      const inv = mass / (r2 * Math.sqrt(r2));
      fx += dx * inv;
      fy += dy * inv;
      fz += dz * inv;
    }
    vx += fx * dt;
    vy += fy * dt;
    vz += fz * dt;
    if (op.speedLimit > 0) {
      const s = Math.hypot(vx, vy, vz);
      if (s > op.speedLimit) {
        const scale = op.speedLimit / s;
        vx *= scale;
        vy *= scale;
        vz *= scale;
      }
    }
    const damp = Math.exp(-op.drag * dt);
    vx *= damp;
    vy *= damp;
    vz *= damp;
    px += vx * dt;
    py += vy * dt;
    pz += vz * dt;
    let age = at(state.age, i) + dt;
    let respawn = false;
    const mode = op.bounds[0];
    const radius = op.bounds[1];
    if (mode > 0) {
      const len = Math.hypot(px, py, pz);
      if (len > radius) {
        if (mode === 1) {
          const s = (-radius * 0.98) / len;
          px *= s;
          py *= s;
          pz *= s;
        } else if (mode === 2) {
          const nx = px / len,
            ny = py / len,
            nz = pz / len;
          const along = vx * nx + vy * ny + vz * nz;
          if (along > 0) {
            vx = (vx - 2 * along * nx) * 0.9;
            vy = (vy - 2 * along * ny) * 0.9;
            vz = (vz - 2 * along * nz) * 0.9;
          }
          px = nx * radius;
          py = ny * radius;
          pz = nz * radius;
        } else respawn = true;
      }
    }
    if (spawn.emitter > 0.5 && age >= at(state.life, i)) respawn = true;
    if (respawn) {
      const p = spawnPosition(
        config.shape,
        seed,
        i,
        stepIndex,
        spawn.radius,
        spawn.size,
        spawn.center,
        spawn.view,
      );
      const rel: Vec3 = [p[0] - spawn.center[0], p[1] - spawn.center[1], p[2] - spawn.center[2]];
      const v = spawnVelocity(config.velocityMode, spawn.velocitySpeed, rel, seed, i, stepIndex);
      [px, py, pz] = p;
      [vx, vy, vz] = v;
      age = 0;
      state.life[i] =
        spawn.lifeMin + (spawn.lifeMax - spawn.lifeMin) * unit(seed, i, STREAM.life, stepIndex);
    }
    state.pos[k] = f(px);
    state.pos[k + 1] = f(py);
    state.pos[k + 2] = f(pz);
    state.vel[k] = f(vx);
    state.vel[k + 1] = f(vy);
    state.vel[k + 2] = f(vz);
    state.age[i] = f(age);
  }
}
