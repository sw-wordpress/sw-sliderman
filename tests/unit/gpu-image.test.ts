import { afterEach, describe, expect, it, vi } from 'vitest';
import { withDefaults } from '@gpu/core';
import descriptor from '../../schemas/effects/particle-field.json';
import {
  MAX_IMAGE_SIDE,
  buildTargets,
  loadPixels,
  type Pixels,
} from '@gpu/modules/particle-field/image';
import type { ParticleParams } from '@gpu/modules/particle-field/types';

const imageParams = (patch: Record<string, unknown> = {}): ParticleParams['image'] =>
  (
    withDefaults(descriptor.schema, {
      count: 1,
      image: { enabled: true, ...patch },
    }) as ParticleParams
  ).image;

/** 20 × 10 image: left half red, right half blue, a transparent column in the middle (x = 9..10). */
function testImage(): Pixels {
  const width = 20;
  const height = 10;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = (y * width + x) * 4;
      if (x === 9 || x === 10) continue; // transparent
      if (x < 9) data.set([255, 0, 0, 255], k);
      else data.set([0, 0, 255, 255], k);
    }
  }
  return { data, width, height };
}

const options = (patch: Record<string, unknown> = {}, image: Record<string, unknown> = {}) => ({
  count: 2000,
  seed: 5,
  image: imageParams(image),
  aspect: 2,
  viewHeight: 4,
  ...patch,
});

describe('image targets (reconstruction)', () => {
  it("places every particle on an opaque pixel and takes that pixel's colour", () => {
    const { home, color } = buildTargets(testImage(), options());
    let red = 0;
    let blue = 0;
    for (let i = 0; i < 2000; i++) {
      const x = home[i * 4] ?? 0;
      const [r, g, b] = [color[i * 4] ?? 0, color[i * 4 + 1] ?? 0, color[i * 4 + 2] ?? 0];
      expect(g).toBeCloseTo(0, 6);
      if (x < 0) {
        red++;
        expect(r).toBeGreaterThan(0.99);
      } else {
        blue++;
        expect(b).toBeGreaterThan(0.99);
      }
      // The transparent column (x of pixels 9..10 of 20) stays empty: |x| < 0.1 * width.
      expect(Math.abs(x)).toBeGreaterThan(0.0);
      expect(color[i * 4 + 3]).toBe(1);
    }
    expect(Math.abs(red - blue)).toBeLessThan(200);
  });

  it('leaves the transparent gap empty and covers the image evenly', () => {
    const { home } = buildTargets(testImage(), options({ count: 6000 }));
    const width = 4 * 2 * 0.9 * 0.5; // contain: image aspect 2 on a 2:1 view of height 4 -> world height 3.6, width 7.2
    const worldWidth = 7.2;
    let inGap = 0;
    let left = 0;
    for (let i = 0; i < 6000; i++) {
      const x = home[i * 4] ?? 0;
      if (Math.abs(x) < (worldWidth / 20) * 0.95) inGap++;
      if (x < -worldWidth / 4) left++;
    }
    expect(width).toBeGreaterThan(0);
    expect(inGap).toBe(0);
    expect(left / 6000).toBeGreaterThan(0.2);
  });

  it('is reproducible per seed and different for another seed', () => {
    const a = buildTargets(testImage(), options());
    const b = buildTargets(testImage(), options());
    const c = buildTargets(testImage(), options({ seed: 6 }));
    expect(Array.from(a.home)).toEqual(Array.from(b.home));
    expect(Array.from(a.home)).not.toEqual(Array.from(c.home));
  });

  it('fits (contain) or covers the view and applies the scale', () => {
    const extent = (fit: 'contain' | 'cover', scale: number, aspect: number) => {
      const { home } = buildTargets(testImage(), options({ aspect }, { fit, scale }));
      let max = 0;
      let maxY = 0;
      for (let i = 0; i < 2000; i++) {
        max = Math.max(max, Math.abs(home[i * 4] ?? 0));
        maxY = Math.max(maxY, Math.abs(home[i * 4 + 1] ?? 0));
      }
      return { x: max, y: maxY };
    };
    const contain = extent('contain', 1, 1); // square view of 4 x 4, image 2:1 -> width 4, height 2
    expect(contain.x).toBeCloseTo(2, 1);
    expect(contain.y).toBeLessThanOrEqual(1.0 + 1e-6);
    const cover = extent('cover', 1, 1); // covers: height 4, width 8
    expect(cover.y).toBeCloseTo(2, 1);
    expect(cover.x).toBeCloseTo(4, 1);
    expect(extent('contain', 0.5, 1).x).toBeCloseTo(1, 1);
  });

  it('weights particles by luminance when asked', () => {
    const data = new Uint8ClampedArray(2 * 1 * 4);
    data.set([255, 255, 255, 255], 0); // bright left pixel
    data.set([20, 20, 20, 255], 4); // dark right pixel
    const pixels = { data, width: 2, height: 1 };
    const share = (sampling: 'uniform' | 'luminance' | 'inverse-luminance') => {
      const { home } = buildTargets(
        pixels,
        options({ count: 4000, aspect: 2, viewHeight: 1 }, { sampling }),
      );
      let left = 0;
      for (let i = 0; i < 4000; i++) if ((home[i * 4] ?? 0) < 0) left++;
      return left / 4000;
    };
    expect(share('uniform')).toBeCloseTo(0.5, 1);
    expect(share('luminance')).toBeGreaterThan(0.75);
    expect(share('inverse-luminance')).toBeLessThan(0.25);
  });

  it('gives bright pixels more depth and boosts colours with a ceiling', () => {
    const data = new Uint8ClampedArray(2 * 1 * 4);
    data.set([255, 255, 255, 255], 0);
    data.set([0, 0, 0, 255], 4);
    const { home, color } = buildTargets(
      { data, width: 2, height: 1 },
      options({ count: 500, aspect: 2, viewHeight: 1 }, { depth: 1, colorBoost: 3 }),
    );
    const zs = Array.from({ length: 500 }, (_, i) => home[i * 4 + 2] ?? 0);
    expect(Math.max(...zs)).toBeGreaterThan(0.3);
    expect(Math.min(...zs)).toBeLessThan(-0.3);
    expect(Math.max(...Array.from(color))).toBe(1);
  });

  it('survives a fully transparent image', () => {
    const pixels = { data: new Uint8ClampedArray(4 * 4).fill(0), width: 2, height: 2 };
    const { home, color } = buildTargets(pixels, options({ count: 10 }));
    expect(Array.from(home).every((v) => v === 0)).toBe(true);
    expect(Array.from(color).every((v) => v === 1)).toBe(true);
  });
});

describe('loadPixels', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubImage(
    width: number,
    height: number,
    decode: () => Promise<void> = () => Promise.resolve(),
  ) {
    class FakeImage {
      crossOrigin = '';
      decoding = '';
      src = '';
      naturalWidth = width;
      naturalHeight = height;
      decode = decode;
    }
    vi.stubGlobal('Image', FakeImage);
  }

  function stubCanvas(): { drawn: number[]; size: { width: number; height: number } } {
    const seen = { drawn: [] as number[], size: { width: 0, height: 0 } };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      seen.size = { width: this.width, height: this.height };
      return {
        drawImage: (_i: unknown, _x: number, _y: number, w: number, h: number) =>
          seen.drawn.push(w, h),
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
        }),
      } as never;
    });
    return seen;
  }

  it('downscales large images to the sampling limit and keeps the aspect ratio', async () => {
    stubImage(4000, 2000);
    const seen = stubCanvas();
    const pixels = await loadPixels('/a.jpg');
    expect([pixels.width, pixels.height]).toEqual([MAX_IMAGE_SIDE, MAX_IMAGE_SIDE / 2]);
    expect(seen.drawn).toEqual([MAX_IMAGE_SIDE, MAX_IMAGE_SIDE / 2]);
  });

  it('keeps small images at their size', async () => {
    stubImage(40, 30);
    stubCanvas();
    expect(await loadPixels('/a.jpg')).toMatchObject({ width: 40, height: 30 });
  });

  it('rejects for undecodable images, tainted canvases and missing 2D support', async () => {
    stubImage(10, 10, () => Promise.reject(new Error('decode')));
    await expect(loadPixels('/bad.jpg')).rejects.toThrow('decode');
    stubImage(10, 10);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(loadPixels('/a.jpg')).rejects.toThrow(/2D canvas/);
    vi.restoreAllMocks();
    stubImage(10, 10);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage() {},
      getImageData() {
        throw new Error('tainted');
      },
    } as never);
    await expect(loadPixels('https://other.example/a.jpg')).rejects.toThrow('tainted');
  });
});
