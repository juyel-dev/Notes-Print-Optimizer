import { describe, expect, it } from 'vitest';
import { analyzeImageData } from '../../lib/optimizer/analysis';
import type { PageClassification, PageProfile } from '../../lib/optimizer/types';

type Rgb = [number, number, number];

interface CalibrationCase {
  name: string;
  expected: PageClassification;
  build: () => ImageData;
  assertProfile?: (profile: PageProfile) => void;
}

function makeImage(width: number, height: number, rgb: Rgb): ImageData {
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

function fillRect(image: ImageData, x0: number, y0: number, width: number, height: number, rgb: Rgb): void {
  const x1 = Math.min(image.width, x0 + width);
  const y1 = Math.min(image.height, y0 + height);
  for (let y = Math.max(0, y0); y < y1; y++) {
    for (let x = Math.max(0, x0); x < x1; x++) {
      const idx = (y * image.width + x) * 4;
      image.data[idx] = rgb[0];
      image.data[idx + 1] = rgb[1];
      image.data[idx + 2] = rgb[2];
      image.data[idx + 3] = 255;
    }
  }
}

function drawLine(image: ImageData, x0: number, y0: number, x1: number, y1: number, thickness: number, rgb: Rgb): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const radius = Math.max(0, Math.floor(thickness / 2));

  for (let step = 0; step <= steps; step++) {
    const t = steps === 0 ? 0 : step / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    fillRect(image, x - radius, y - radius, thickness, thickness, rgb);
  }
}

/* Small deterministic representatives for the digital lecture-PDF branches.
 * These are synthetic calibration fixtures, not claims about an external dataset.
 */
function lightPrintedLandscape(): ImageData {
  const image = makeImage(320, 180, [248, 248, 246]);
  fillRect(image, 24, 18, 110, 6, [38, 42, 48]);
  for (let row = 0; row < 9; row++) {
    const y = 42 + row * 12;
    drawLine(image, 24, y, 290 - (row % 3) * 24, y, 2, [55, 58, 64]);
    drawLine(image, 24, y + 4, 210 - (row % 4) * 16, y + 4, 1, [115, 118, 122]);
  }
  return image;
}

function portraitPrintedPage(): ImageData {
  const image = makeImage(180, 280, [249, 249, 247]);
  fillRect(image, 18, 18, 96, 7, [35, 38, 44]);
  for (let row = 0; row < 16; row++) {
    const y = 40 + row * 14;
    drawLine(image, 18, y, 160 - (row % 4) * 12, y, 1, [62, 64, 69]);
    if (row % 3 === 0) {
      fillRect(image, 18, y + 4, 54, 3, [160, 160, 158]);
    }
  }
  return image;
}

function screenshotHeavy(): ImageData {
  const image = makeImage(320, 180, [228, 231, 238]);

  // UI-like cards, borders and color accents.
  fillRect(image, 18, 16, 132, 34, [247, 248, 250]);
  fillRect(image, 174, 16, 128, 34, [240, 242, 246]);
  fillRect(image, 18, 64, 284, 4, [150, 155, 166]);
  fillRect(image, 18, 82, 72, 48, [224, 74, 89]);
  fillRect(image, 104, 82, 72, 48, [53, 112, 224]);
  fillRect(image, 190, 82, 72, 48, [54, 170, 104]);
  drawLine(image, 18, 146, 302, 146, 3, [72, 78, 92]);
  drawLine(image, 18, 158, 246, 158, 2, [105, 111, 122]);
  return image;
}

function mixedPolarityPage(): ImageData {
  const image = makeImage(320, 180, [30, 32, 42]);
  fillRect(image, 160, 0, 160, 180, [246, 246, 244]);
  fillRect(image, 24, 24, 100, 8, [242, 242, 244]);
  fillRect(image, 184, 24, 98, 8, [34, 37, 42]);
  for (let row = 0; row < 7; row++) {
    const y = 54 + row * 16;
    drawLine(image, 24, y, 136, y, 2, [224, 226, 232]);
    drawLine(image, 184, y, 292 - (row % 2) * 16, y, 2, [56, 58, 62]);
  }
  return image;
}

const cases: CalibrationCase[] = [
  {
    name: 'light printed landscape',
    expected: 'LIGHT_SLIDE',
    build: lightPrintedLandscape,
  },
  {
    name: 'portrait printed page',
    expected: 'LIGHT_SLIDE',
    build: portraitPrintedPage,
    assertProfile: (profile) => {
      expect(profile.height).toBeGreaterThan(profile.width);
      expect(profile.foregroundPolarity).toBe('dark-on-light');
      expect(profile.polarityConfidence).toBeGreaterThan(0.9);
    },
  },
  {
    name: 'screenshot-like page',
    expected: 'SCREENSHOT_HEAVY',
    build: screenshotHeavy,
    assertProfile: (profile) => {
      expect(profile.colorfulPixelRatio).toBeGreaterThan(0.02);
      expect(profile.edgeDensity).toBeGreaterThan(0.015);
      expect(profile.longLineDensity).toBeGreaterThan(0.04);
      expect(profile.classification).not.toBe('DIAGRAM_EQUATION');
    },
  },
  {
    name: 'mixed polarity page',
    expected: 'MIXED',
    build: mixedPolarityPage,
    assertProfile: (profile) => {
      expect(profile.foregroundPolarity).toBe('mixed');
      expect(profile.polarityConfidence).toBeLessThan(0.05);
    },
  },
];

describe('heterogeneous corpus calibration', () => {
  for (const testCase of cases) {
    it('keeps ' + testCase.name + ' in the intended analyzer branch', () => {
      const profile = analyzeImageData(testCase.build(), 0);

      expect(profile.classification).toBe(testCase.expected);
      expect(profile.density).toBeDefined();
      expect(profile.foregroundCoverage).toBeGreaterThanOrEqual(0);
      expect(profile.foregroundCoverage).toBeLessThanOrEqual(1);
      expect(profile.longLineDensity).toBeGreaterThanOrEqual(0);
      expect(profile.longLineDensity).toBeLessThanOrEqual(1);
      expect(profile.diagramEquationScore).toBeGreaterThanOrEqual(0);
      expect(profile.diagramEquationScore).toBeLessThanOrEqual(1);
      testCase.assertProfile?.(profile);
    });
  }
});
