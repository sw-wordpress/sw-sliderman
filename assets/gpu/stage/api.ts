import {
  blend,
  ease,
  hash32,
  hashAt,
  mulberry32,
  toUnit,
  unitAt,
  validateParams,
  withDefaults,
} from '../core/index';
import type { EffectModule } from '../core/index';
import type { GpuDevice } from '../device/webgl2';

/**
 * What the platform hands to an effect module (also to add-on modules): a module file default-exports
 * `(api) => EffectModule`, so it needs no imports and no copy of the core. Version 1.
 */
export const GPU_API_VERSION = 1;

export interface GpuApi {
  readonly version: number;
  readonly core: {
    readonly hash32: typeof hash32;
    readonly hashAt: typeof hashAt;
    readonly unitAt: typeof unitAt;
    readonly toUnit: typeof toUnit;
    readonly mulberry32: typeof mulberry32;
    readonly blend: typeof blend;
    readonly ease: typeof ease;
    readonly withDefaults: typeof withDefaults;
    readonly validateParams: typeof validateParams;
  };
}

export type EffectModuleFactory = (api: GpuApi) => EffectModule<GpuDevice>;

export const gpuApi: GpuApi = {
  version: GPU_API_VERSION,
  core: { hash32, hashAt, unitAt, toUnit, mulberry32, blend, ease, withDefaults, validateParams },
};
