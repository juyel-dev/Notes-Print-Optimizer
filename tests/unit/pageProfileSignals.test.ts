import { describe, expect, it } from 'vitest';
import { analyzeImageData } from '../../lib/optimizer/analysis';

function solidImage(
  width: number,
  height: number,
  rgb: [number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    data[idx] = rgb[0];
    data[idx + 1] = rgb[1];
    data[idx + 2] = rgb[2];
    data[idx + 3] = 255;
  }
  return new ImageData(data, width, height);
}

describe('PageProfile structural signals', () => {
  it('reports dark-on-light polarity for a light page', () => {
    const image = solidImage(100, 100, [248, 248, 248]);
    const data = image.data;

    for (let y = 20; y < 80; y++) {
      for (let x = 45; x < 55; x++) {
        const idx = (y * 100 + x) * 4;
        data[idx] = 25;
        data[idx + 1] = 25;
        data[idx + 2] = 25;
      }
    }

    const profile = analyzeImageData(image, 0);

    expect(profile.foregroundPolarity).toBe('dark-on-light');
    expect(profile.edgeDensity).toBeGreaterThanOrEqual(0);
    expect(profile.edgeDensity).toBeLessThanOrEqual(1);
    expect(profile.colorfulPixelRatio).toBe(0);
    expect(profile.density).toBe('medium');
  });

  it('reports light-on-dark polarity for a dark page', () => {
    const image = solidImage(100, 100, [35, 35, 35]);
    const data = image.data;

    for (let y = 20; y < 80; y++) {
      for (let x = 45; x < 55; x++) {
        const idx = (y * 100 + x) * 4;
        data[idx] = 245;
        data[idx + 1] = 245;
        data[idx + 2] = 245;
      }
    }

    const profile = analyzeImageData(image, 0);

    expect(profile.foregroundPolarity).toBe('light-on-dark');
    expect(profile.edgeDensity).toBeGreaterThan(0);
  });

  it('exposes structural and color density for screenshot-like raster content', () => {
    const image = new Uint8ClampedArray(100 * 100 * 4);

    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 100; x++) {
        const idx = (y * 100 + x) * 4;
        const band = Math.floor(x / 5) % 2;
        image[idx] = band === 0 ? 235 : 205;
        image[idx + 1] = band === 0 ? 140 : 205;
        image[idx + 2] = band === 0 ? 70 : 205;
        image[idx + 3] = 255;
      }
    }

    const profile = analyzeImageData(new ImageData(image, 100, 100), 0);

    expect(profile.edgeDensity).toBeGreaterThanOrEqual(0.08);
    expect(profile.colorfulPixelRatio).toBeGreaterThanOrEqual(0.02);
    expect(profile.foregroundPolarity).toBe('dark-on-light');
    expect(profile.density).toBe('dense');
  });

  it('classifies a nearly blank page as sparse', () => {
    const profile = analyzeImageData(solidImage(100, 100, [250, 250, 250]), 0);
    expect(profile.density).toBe('sparse');
  });
});
