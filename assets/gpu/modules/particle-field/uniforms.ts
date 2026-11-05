import type { Operator, ParticleParams, Vec3 } from './types';
import { SPAWN_SHAPE_ID, VELOCITY_MODE_ID } from './spawn';

/** Operators flattened to the fixed uniform set of the update shader (the last operator of a type wins). */
export interface OperatorUniforms {
  drag: number;
  spring: [number, number, number, number]; // stiffness, damping, maxForce, enabled
  vortexA: [number, number, number, number]; // normalised axis, strength
  vortexB: [number, number, number, number]; // centre, pull
  vortexOn: number;
  flow: [number, number, number, number]; // frequency, amplitude, speed, enabled
  wells: Float32Array; // 3 × (x, y, z, mass)
  speedLimit: number; // 0 = off
  bounds: [number, number]; // mode (0 none, 1 wrap, 2 bounce, 3 respawn), radius
}

export const BOUNDS_MODE_ID = { wrap: 1, bounce: 2, respawn: 3 } as const;

function normalise(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length < 1e-6 ? [0, 1, 0] : [v[0] / length, v[1] / length, v[2] / length];
}

export function operatorUniforms(operators: readonly Operator[]): OperatorUniforms {
  const out: OperatorUniforms = {
    drag: 0,
    spring: [0, 0, 0, 0],
    vortexA: [0, 1, 0, 0],
    vortexB: [0, 0, 0, 0],
    vortexOn: 0,
    flow: [1, 0, 0, 0],
    wells: new Float32Array(12),
    speedLimit: 0,
    bounds: [0, 1],
  };
  for (const op of operators) {
    switch (op.type) {
      case 'drag':
        out.drag = op.amount;
        break;
      case 'spring-home':
        out.spring = [op.stiffness, op.damping, op.maxForce, 1];
        break;
      case 'vortex': {
        const axis = normalise(op.axis);
        out.vortexA = [axis[0], axis[1], axis[2], op.strength];
        out.vortexB = [op.center[0], op.center[1], op.center[2], op.pull];
        out.vortexOn = 1;
        break;
      }
      case 'flow-field':
        out.flow = [op.frequency, op.amplitude, op.speed, op.amplitude > 0 ? 1 : 0];
        break;
      case 'gravity-wells':
        out.wells.fill(0);
        op.wells
          .slice(0, 3)
          .forEach((well, i) =>
            out.wells.set([well.position[0], well.position[1], well.position[2], well.mass], i * 4),
          );
        break;
      case 'speed-limit':
        out.speedLimit = op.max;
        break;
      case 'bounds':
        out.bounds = [BOUNDS_MODE_ID[op.mode], op.radius];
        break;
    }
  }
  return out;
}

export interface SpawnUniforms {
  shape: number;
  radius: number;
  size: Vec3;
  center: Vec3;
  velocityMode: number;
  velocitySpeed: number;
  emitter: number;
  lifeMin: number;
  lifeMax: number;
}

export function spawnUniforms(params: ParticleParams): SpawnUniforms {
  const { spawn, lifecycle } = params;
  return {
    shape: SPAWN_SHAPE_ID[spawn.shape],
    radius: spawn.radius,
    size: spawn.size,
    center: spawn.position,
    velocityMode: VELOCITY_MODE_ID[spawn.velocity.mode],
    velocitySpeed: spawn.velocity.speed,
    emitter: lifecycle.mode === 'emitter' ? 1 : 0,
    lifeMin: Math.min(lifecycle.minSeconds, lifecycle.maxSeconds),
    lifeMax: Math.max(lifecycle.minSeconds, lifecycle.maxSeconds),
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = /^#[0-9a-fA-F]{6}$/.test(hex) ? parseInt(hex.slice(1), 16) : 0xffffff;
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}
