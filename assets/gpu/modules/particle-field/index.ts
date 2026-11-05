import type { EffectModule } from '@gpu/core/types';
import type { GpuDevice } from '@gpu/device/webgl2';
import descriptor from '../../../../schemas/effects/particle-field.json';
import { ParticleInstance } from './instance';
import type { ParticleParams } from './types';

/**
 * `particle-field` effect module. The descriptor JSON (schema, presets, labels) is the single source
 * for PHP validation, the editor panel and this module.
 */
export const particleField: EffectModule<GpuDevice> = {
  type: descriptor.type,
  schemaVersion: descriptor.schemaVersion,
  label: descriptor.label,
  continuous: descriptor.continuous,
  backends: ['webgl2'],
  parameterSchema: descriptor.schema,
  presets: descriptor.presets,
  create: (context, params) =>
    Promise.resolve(
      new ParticleInstance({
        device: context.device,
        seed: context.seed,
        params: params as unknown as ParticleParams,
        quality: context.quality,
        type: descriptor.type,
        schemaVersion: descriptor.schemaVersion,
      }),
    ),
};

/** Module file contract: a default-exported factory (the platform passes its API; unused here). */
export default (): EffectModule<GpuDevice> => particleField;
