/** Bundled in memory by tests/e2e/gpu-particles.mjs: gives the browser test access to the real classes. */
import { GpuDevice } from '@gpu/device/webgl2';
import { ParticleInstance } from '@gpu/modules/particle-field/instance';
import { initialState, step } from '@gpu/modules/particle-field/reference';
import { operatorUniforms, spawnUniforms } from '@gpu/modules/particle-field/uniforms';
import { spawnPosition } from '@gpu/modules/particle-field/spawn';
import { particleField } from '@gpu/modules/particle-field';
import { withDefaults, validateParams } from '@gpu/core/schema';

Object.assign(window, {
  __h: {
    GpuDevice,
    ParticleInstance,
    initialState,
    step,
    operatorUniforms,
    spawnUniforms,
    spawnPosition,
    particleField,
    withDefaults,
    validateParams,
  },
});
