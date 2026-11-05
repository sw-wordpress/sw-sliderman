import type { EffectModule } from '@gpu/core/types';
import type { GpuDevice } from '@gpu/device/webgl2';
import descriptor from '../../../../schemas/effects/particle-field.json';
import { buildTargets, loadPixels } from './image';
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
  create: async (context, rawParams) => {
    const params = rawParams as unknown as ParticleParams;
    let image = null;
    const url = params.image.enabled ? context.assets.url('image') : null;
    if (url) {
      // A missing or unreadable image rejects here; the stage then shows the static fallback image.
      const pixels = await loadPixels(url);
      const viewport = context.viewport ?? { width: 16, height: 9, pixelRatio: 1 };
      image = buildTargets(pixels, {
        count: params.count,
        seed: context.seed,
        image: params.image,
        aspect: viewport.width / Math.max(viewport.height, 1),
        viewHeight: 2 * params.camera.distance * Math.tan((params.camera.fov * Math.PI) / 360),
      });
    }
    return new ParticleInstance({
      device: context.device,
      seed: context.seed,
      params,
      quality: context.quality,
      type: descriptor.type,
      schemaVersion: descriptor.schemaVersion,
      image,
    });
  },
};

/** Module file contract: a default-exported factory (the platform passes its API; unused here). */
export default (): EffectModule<GpuDevice> => particleField;
