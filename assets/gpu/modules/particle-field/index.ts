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
    // The picture is loaded whenever a medium is set, so image settings can be switched on and off live.
    const url = context.assets.url('image');
    // A missing or unreadable image rejects here; the stage then shows the static fallback image.
    const pixels = url ? await loadPixels(url) : null;
    const targets = (aspect: number, current: ParticleParams) =>
      pixels && current.image.enabled
        ? buildTargets(pixels, {
            count: current.count,
            seed: context.seed,
            image: current.image,
            aspect,
            viewHeight:
              2 * current.camera.distance * Math.tan((current.camera.fov * Math.PI) / 360),
          })
        : null;
    const viewport = context.viewport ?? { width: 16, height: 9, pixelRatio: 1 };
    const image = targets(viewport.width / Math.max(viewport.height, 1), params);
    return new ParticleInstance({
      device: context.device,
      seed: context.seed,
      params,
      quality: context.quality,
      type: descriptor.type,
      schemaVersion: descriptor.schemaVersion,
      image,
      viewport,
      rebuildImage: targets,
    });
  },
};

/** Module file contract: a default-exported factory (the platform passes its API; unused here). */
export default (): EffectModule<GpuDevice> => particleField;
