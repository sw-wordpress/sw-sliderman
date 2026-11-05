/** Parameter types of the `particle-field` module (schema: schemas/effects/particle-field.json). */
export type Vec3 = readonly [number, number, number];

export type SpawnShape =
  'point' | 'disc' | 'ring' | 'sphere-surface' | 'sphere-volume' | 'box' | 'line';
export const SPAWN_SHAPES: readonly SpawnShape[] = [
  'point',
  'disc',
  'ring',
  'sphere-surface',
  'sphere-volume',
  'box',
  'line',
];

export type VelocityMode = 'none' | 'radial' | 'tangential' | 'random';
export const VELOCITY_MODES: readonly VelocityMode[] = ['none', 'radial', 'tangential', 'random'];

export type Operator =
  | { type: 'drag'; amount: number }
  | { type: 'spring-home'; stiffness: number; damping: number; maxForce: number }
  | { type: 'vortex'; axis: Vec3; center: Vec3; strength: number; pull: number }
  | { type: 'flow-field'; frequency: number; amplitude: number; speed: number }
  | { type: 'gravity-wells'; wells: ReadonlyArray<{ position: Vec3; mass: number }> }
  | { type: 'speed-limit'; max: number }
  | { type: 'bounds'; mode: 'wrap' | 'bounce' | 'respawn'; radius: number };

export interface ParticleParams {
  count: number;
  spawn: {
    shape: SpawnShape;
    radius: number;
    size: Vec3;
    position: Vec3;
    velocity: { mode: VelocityMode; speed: number };
  };
  lifecycle: { mode: 'persistent' | 'emitter'; minSeconds: number; maxSeconds: number };
  operators: Operator[];
  appearance: {
    style: 'soft-disc' | 'glow' | 'pixel';
    sizeMin: number;
    sizeMax: number;
    colorMode: 'solid' | 'speed' | 'life' | 'palette' | 'image';
    color: string;
    color2: string;
    palette: string[];
    blend: 'additive' | 'normal';
    opacity: number;
    depthFade: number;
  };
  camera: {
    projection: 'perspective' | 'orthographic';
    distance: number;
    fov: number;
    orbitSpeed: number;
    tilt: number;
  };
  interaction: { mode: 'none' | 'repel' | 'attract' | 'swirl'; radius: number; strength: number };
}
