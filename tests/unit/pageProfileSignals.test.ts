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
    expect(profile.polarityConfidence).toBeGreaterThan(0.9);
    expect(profile.foregroundCoverage).toBeGreaterThan(0.05);
    expect(profile.foregroundCoverage).toBeLessThan(0.1);
    expect(profile.contentBoundingBox).toBeDefined();
    expect(profile.margins).toBeDefined();
    expect(profile.edgeDensity).toBeGreaterThanOrEqual(0);
    expect(profile.edgeDensity).toBeLessThanOrEqual(1);
    expect(profile.colorfulPixelRatio).toBe(0);
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
    expect(profile.polarityConfidence).toBeGreaterThan(0.9);
    expect(profile.foregroundCoverage).toBeGreaterThan(0.05);
    expect(profile.foregroundCoverage).toBeLessThan(0.1);
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
    expect(profile.density).toBe('medium');
  });

  it('reports mixed polarity and uses local foreground detection', () => {
    const image = solidImage(128, 100, [20, 20, 20]);
    const data = image.data;

    for (let y = 0; y < 100; y++) {
      for (let x = 64; x < 128; x++) {
        const idx = (y * 128 + x) * 4;
        data[idx] = 245;
        data[idx + 1] = 245;
        data[idx + 2] = 245;
      }
    }

    for (let y = 20; y < 80; y++) {
      for (let x = 28; x < 34; x++) {
        const idx = (y * 128 + x) * 4;
        data[idx] = 245;
        data[idx + 1] = 245;
        data[idx + 2] = 245;
      }
    }

    for (let y = 20; y < 80; y++) {
      for (let x = 92; x < 98; x++) {
        const idx = (y * 128 + x) * 4;
        data[idx] = 20;
        data[idx + 1] = 20;
        data[idx + 2] = 20;
      }
    }

    const profile = analyzeImageData(new ImageData(data, 128, 100), 0);

    expect(profile.foregroundPolarity).toBe('mixed');
    expect(profile.polarityConfidence).toBeLessThan(0.2);
    expect(profile.foregroundCoverage).toBeGreaterThan(0.03);
    expect(profile.foregroundCoverage).toBeLessThan(0.15);
    expect(profile.classification).toBe('MIXED');
    expect(profile.contentBoundingBox).toBeDefined();
    expect(profile.margins).toBeDefined();
  });

  it('marks sparse dark pages as sparse instead of dense background coverage', () => {
    const image = solidImage(100, 100, [25, 25, 25]);
    const data = image.data;

    for (let y = 45; y < 55; y++) {
      for (let x = 45; x < 55; x++) {
        const idx = (y * 100 + x) * 4;
        data[idx] = 245;
        data[idx + 1] = 245;
        data[idx + 2] = 245;
      }
    }

    const profile = analyzeImageData(new ImageData(data, 100, 100), 0);

    expect(profile.foregroundCoverage).toBeGreaterThan(0);
    expect(profile.foregroundCoverage).toBeLessThan(0.03);
    expect(profile.sparseContent).toBe(true);
    expect(profile.density).toBe('sparse');
    expect(profile.inkDensity).toBeGreaterThan(0.9);
  });

  it('flags color presence independently from dominant hue magnitude', () => {
    const image = solidImage(100, 100, [20, 20, 20]);
    const data = image.data;

    for (let y = 40; y < 60; y++) {
      for (let x = 45; x < 55; x++) {
        const idx = (y * 100 + x) * 4;
        data[idx] = 245;
        data[idx + 1] = 220;
        data[idx + 2] = 60;
      }
    }

    const profile = analyzeImageData(new ImageData(data, 100, 100), 0);

    expect(profile.coloredAnnotationPresent).toBe(true);
    expect(profile.colorfulPixelRatio).toBeGreaterThan(0);
  });

  it('flags thin foreground structure for preservation', () => {
    const image = solidImage(200, 100, [25, 25, 25]);
    const data = image.data;

    for (let y = 10; y < 90; y++) {
      for (let x = 99; x < 101; x++) {
        const idx = (y * 200 + x) * 4;
        data[idx] = 245;
        data[idx + 1] = 245;
        data[idx + 2] = 245;
      }
    }

    const profile = analyzeImageData(new ImageData(data, 200, 100), 0);

    expect(profile.thinStrokeRisk).toBe(true);
    expect(profile.foregroundCoverage).toBeLessThan(0.05);
  });


  it('detects long structural lines on a dark diagram-like page', () => {
    const image = solidImage(160, 100, [25, 25, 25]);
    const data = image.data;

    for (let x = 25; x < 135; x++) {
      const y = 25;
      const idx = (y * 160 + x) * 4;
      data[idx] = 245;
      data[idx + 1] = 245;
      data[idx + 2] = 245;
    }

    for (let y = 25; y < 75; y++) {
      const idx = (y * 160 + 25) * 4;
      data[idx] = 245;
      data[idx + 1] = 245;
      data[idx + 2] = 245;
    }

    for (let y = 25; y < 75; y++) {
      const idx = (y * 160 + 135) * 4;
      data[idx] = 245;
      data[idx + 1] = 245;
      data[idx + 2] = 245;
    }

    for (let x = 25; x < 135; x++) {
      const y = 75;
      const idx = (y * 160 + x) * 4;
      data[idx] = 245;
      data[idx + 1] = 245;
      data[idx + 2] = 245;
    }

    const profile = analyzeImageData(new ImageData(data, 160, 100), 0);

    expect(profile.longLineDensity).toBeGreaterThan(0.02);
    expect(profile.diagramEquationScore).toBeGreaterThan(0.58);
    expect(profile.classification).toBe('DIAGRAM_EQUATION');
  });

  it('does not treat a dark page with only sparse isolated content as diagram-like', () => {
    const image = solidImage(160, 100, [25, 25, 25]);
    const data = image.data;

    for (let y = 15; y < 85; y += 10) {
      for (let x = 20; x < 140; x += 20) {
        const idx = (y * 160 + x) * 4;
        data[idx] = 245;
        data[idx + 1] = 245;
        data[idx + 2] = 245;
      }
    }

    const profile = analyzeImageData(new ImageData(data, 160, 100), 0);

    expect(profile.longLineDensity).toBeLessThan(0.2);
    expect(profile.diagramEquationScore).toBeLessThan(0.58);
    expect(profile.classification).toBe('DARK_SLIDE');
  });

  it('classifies a nearly blank page as sparse', () => {
    const profile = analyzeImageData(solidImage(100, 100, [250, 250, 250]), 0);
    expect(profile.density).toBe('sparse');
  });
});
