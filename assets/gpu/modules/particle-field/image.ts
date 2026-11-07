import { hashAt, toUnit } from '@gpu/core/rng';
import { STREAM } from './spawn';
import type { ParticleParams } from './types';

/** Pixel data of the source image (RGBA, row-major), already downscaled. */
export interface Pixels {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/** Home positions (xyz, w unused) and colours (rgba, 0..1) for every particle. */
export interface ImageTargets {
  readonly home: Float32Array;
  readonly color: Float32Array;
}

export interface TargetOptions {
  readonly count: number;
  readonly seed: number;
  readonly image: ParticleParams['image'];
  /** Aspect ratio (width / height) of the effect area. */
  readonly aspect: number;
  /** Height of the visible area at the image plane, in world units. */
  readonly viewHeight: number;
}

const luminance = (r: number, g: number, b: number): number =>
  (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/**
 * Image reconstruction (spec 2.6): particles are distributed over the image (uniformly or weighted
 * by luminance), each takes the bilinearly sampled colour of its position and keeps it as its home.
 * Transparent pixels never receive particles. Pure and seeded, so the result is reproducible.
 */
export function buildTargets(pixels: Pixels, options: TargetOptions): ImageTargets {
  const { width, height, data } = pixels;
  const { count, seed, image, aspect, viewHeight } = options;
  const weights = new Float64Array(width * height);
  let total = 0;
  for (let i = 0; i < width * height; i++) {
    const a = (data[i * 4 + 3] ?? 0) / 255;
    const l = luminance(data[i * 4] ?? 0, data[i * 4 + 1] ?? 0, data[i * 4 + 2] ?? 0);
    const w =
      a < 0.05
        ? 0
        : image.sampling === 'luminance'
          ? a * (0.05 + l)
          : image.sampling === 'inverse-luminance'
            ? a * (1.05 - l)
            : a;
    total += w;
    weights[i] = total; // cumulative
  }
  const home = new Float32Array(count * 4);
  const color = new Float32Array(count * 4);
  if (total <= 0) return { home, color: color.fill(1) };

  // Fit the image into (contain) or over (cover) the visible area, then apply the user scale.
  const viewWidth = viewHeight * aspect;
  const imageAspect = width / height;
  const fitScale =
    image.fit === 'cover'
      ? Math.max(viewWidth / imageAspect, viewHeight)
      : Math.min(viewWidth / imageAspect, viewHeight);
  const worldHeight = fitScale * image.scale;
  const worldWidth = worldHeight * imageAspect;

  const find = (target: number): number => {
    let low = 0;
    let high = width * height - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((weights[mid] ?? 0) >= target) high = mid;
      else low = mid + 1;
    }
    return low;
  };
  /** Bilinear colour at a position, weighted by alpha so transparent neighbours do not darken edges. */
  const rgb = [0, 0, 0];
  const sample = (x: number, y: number): void => {
    const fx = Math.min(Math.max(x - 0.5, 0), width - 1);
    const fy = Math.min(Math.max(y - 0.5, 0), height - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, width - 1);
    const y1 = Math.min(y0 + 1, height - 1);
    const tx = fx - x0;
    const ty = fy - y0;
    let r = 0;
    let g = 0;
    let b = 0;
    let sum = 0;
    const add = (px: number, py: number, weight: number): void => {
      const k = (py * width + px) * 4;
      const w = weight * ((data[k + 3] ?? 0) / 255);
      r += (data[k] ?? 0) * w;
      g += (data[k + 1] ?? 0) * w;
      b += (data[k + 2] ?? 0) * w;
      sum += w;
    };
    add(x0, y0, (1 - tx) * (1 - ty));
    add(x1, y0, tx * (1 - ty));
    add(x0, y1, (1 - tx) * ty);
    add(x1, y1, tx * ty);
    const inverse = sum > 0 ? 1 / sum : 0;
    rgb[0] = r * inverse;
    rgb[1] = g * inverse;
    rgb[2] = b * inverse;
  };
  for (let i = 0; i < count; i++) {
    const pixel = find(toUnit(hashAt(seed, i, STREAM.u1)) * total);
    const px = (pixel % width) + toUnit(hashAt(seed, i, STREAM.u2));
    const py = Math.floor(pixel / width) + toUnit(hashAt(seed, i, STREAM.u3));
    sample(px, py);
    const [r = 0, g = 0, b = 0] = rgb;
    const k = i * 4;
    home[k] = (px / width - 0.5) * worldWidth;
    home[k + 1] = (0.5 - py / height) * worldHeight;
    home[k + 2] = image.depth * (luminance(r, g, b) - 0.5);
    color[k] = Math.min(1, (r / 255) * image.colorBoost);
    color[k + 1] = Math.min(1, (g / 255) * image.colorBoost);
    color[k + 2] = Math.min(1, (b / 255) * image.colorBoost);
    color[k + 3] = 1;
  }
  return { home, color };
}

/** Largest side of the sampled bitmap; bounds memory and time (512 × 512 = 262,144 pixels). */
export const MAX_IMAGE_SIDE = 512;

/**
 * Loads a same-origin image and returns its pixels, downscaled to at most {@link MAX_IMAGE_SIDE}.
 * Rejects on a network error, an undecodable file or a tainted canvas (cross-origin without CORS);
 * the stage then shows the static fallback.
 */
export async function loadPixels(url: string): Promise<Pixels> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('2D canvas is not available.');
  context.drawImage(image, 0, 0, width, height);
  return { data: context.getImageData(0, 0, width, height).data, width, height };
}
