/**
 * Semantic analyzer goldens over the committed real PDF fixtures.
 *
 * Unlike pdfGolden.test.ts, this suite freezes the analyzer's page-level
 * profile signals rather than processed output bytes. Exact categorical signals
 * catch classification drift; numeric signals use small tolerances to avoid
 * overfitting platform-specific rasterization noise.
 *
 * Regenerate deliberately with: PAGE_PROFILE_UPDATE_GOLDENS=1
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { analyzeImageData } from '../../lib/optimizer/analysis';
import type { PageProfile } from '../../lib/optimizer/types';
import { openPdfDocument, renderPdfPageOpen } from '../fixtures/pdfRender';

const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'pdf');
const GOLDENS_FILE = join(FIXTURES_DIR, 'pageProfileGoldens.json');
const RENDER_SCALE = 1.8;
const UPDATE_GOLDENS = process.env.PAGE_PROFILE_UPDATE_GOLDENS === '1';
const FIXTURE_NAMES = ['text', 'image', 'scanned', 'mixed'] as const;

interface ProfileGolden {
  width: number;
  height: number;
  classification: PageProfile['classification'];
  density: PageProfile['density'];
  foregroundPolarity: PageProfile['foregroundPolarity'];
  polarityConfidence: number;
  foregroundCoverage: number;
  contentBoundingBox?: PageProfile['contentBoundingBox'];
  margins?: PageProfile['margins'];
  sparseContent: boolean;
  coloredAnnotationPresent: boolean;
  thinStrokeRisk: boolean;
  longLineDensity: number;
  diagramEquationScore: number;
  dominantHue: number;
  edgeDensity: number;
  colorfulPixelRatio: number;
  estimatedNoise: number;
  strokeThickness: number;
  inkDensity: number;
}

interface GoldensFile {
  version: 3;
  renderScale: number;
  numericTolerances: {
    inkDensity: number;
    edgeDensity: number;
    colorfulPixelRatio: number;
    estimatedNoise: number;
    strokeThickness: number;
    foregroundCoverage: number;
    polarityConfidence: number;
    bbox: number;
    longLineDensity: number;
    diagramEquationScore: number;
  };
  fixtures: Record<string, Record<string, ProfileGolden>>;
}

function loadGoldens(): GoldensFile {
  return JSON.parse(readFileSync(GOLDENS_FILE, 'utf8')) as GoldensFile;
}

function readFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES_DIR, name + '.pdf')));
}

function snapshot(profile: PageProfile): ProfileGolden {
  return {
    width: profile.width,
    height: profile.height,
    classification: profile.classification,
    density: profile.density,
    foregroundPolarity: profile.foregroundPolarity,
    polarityConfidence: profile.polarityConfidence ?? 0,
    foregroundCoverage: profile.foregroundCoverage ?? 0,
    contentBoundingBox: profile.contentBoundingBox,
    margins: profile.margins,
    sparseContent: profile.sparseContent ?? false,
    coloredAnnotationPresent: profile.coloredAnnotationPresent ?? false,
    thinStrokeRisk: profile.thinStrokeRisk ?? false,
    longLineDensity: profile.longLineDensity ?? 0,
    diagramEquationScore: profile.diagramEquationScore ?? 0,
    dominantHue: profile.dominantHue,
    edgeDensity: profile.edgeDensity ?? 0,
    colorfulPixelRatio: profile.colorfulPixelRatio ?? 0,
    estimatedNoise: profile.estimatedNoise,
    strokeThickness: profile.strokeThickness,
    inkDensity: profile.inkDensity,
  };
}

function expectNear(actual: number, expected: number, tolerance: number, label: string): void {
  expect(
    Math.abs(actual - expected),
    label + ': expected ' + expected + ' +/- ' + tolerance + ', received ' + actual,
  ).toBeLessThanOrEqual(tolerance);
}

async function collectGoldens(): Promise<GoldensFile> {
  const fixtures: Record<string, Record<string, ProfileGolden>> = {};

  for (const name of FIXTURE_NAMES) {
    const doc = await openPdfDocument(readFixture(name));
    fixtures[name] = {};

    try {
      for (let pageIndex = 0; pageIndex < doc.numPages; pageIndex++) {
        const imageData = await renderPdfPageOpen(doc, pageIndex, RENDER_SCALE);
        fixtures[name][String(pageIndex)] = snapshot(analyzeImageData(imageData, pageIndex));
      }
    } finally {
      await doc.destroy();
    }
  }

  return {
    version: 3,
    renderScale: RENDER_SCALE,
    numericTolerances: {
      inkDensity: 0.01,
      edgeDensity: 0.01,
      colorfulPixelRatio: 0.01,
      estimatedNoise: 5,
      strokeThickness: 0.25,
      foregroundCoverage: 0.02,
      polarityConfidence: 0.05,
      bbox: 0.02,
      longLineDensity: 0.03,
      diagramEquationScore: 0.08,
    },
    fixtures,
  };
}

describe(
  UPDATE_GOLDENS ? 'page profile golden suite (regeneration mode)' : 'page profile golden suite',
  () => {
    if (UPDATE_GOLDENS) {
      it('regenerates pageProfileGoldens.json from committed fixtures', async () => {
        const goldens = await collectGoldens();
        writeFileSync(GOLDENS_FILE, JSON.stringify(goldens, null, 2) + '\n');
        console.log('page profile goldens written to ' + GOLDENS_FILE);
      }, 300_000);
      return;
    }

    const goldens = loadGoldens();

    it('golden metadata matches analyzer render configuration', () => {
      expect(goldens.version).toBe(3);
      expect(goldens.renderScale).toBe(RENDER_SCALE);
    });

    for (const name of FIXTURE_NAMES) {
      it('matches real fixture analyzer profiles for ' + name + '.pdf', async () => {
        const expectedPages = goldens.fixtures[name];
        expect(expectedPages).toBeDefined();
        expect(Object.keys(expectedPages)).not.toHaveLength(0);

        const doc = await openPdfDocument(readFixture(name));
        try {
          expect(doc.numPages).toBe(Object.keys(expectedPages).length);

          for (let pageIndex = 0; pageIndex < doc.numPages; pageIndex++) {
            const imageData = await renderPdfPageOpen(doc, pageIndex, RENDER_SCALE);
            const actual = snapshot(analyzeImageData(imageData, pageIndex));
            const expected = expectedPages[String(pageIndex)];
            expect(expected, 'missing golden for ' + name + '.pdf page ' + pageIndex).toBeDefined();

            expect(actual.width).toBe(expected.width);
            expect(actual.height).toBe(expected.height);
            expect(actual.classification).toBe(expected.classification);
            expect(actual.density).toBe(expected.density);
            expect(actual.foregroundPolarity).toBe(expected.foregroundPolarity);
            expect(actual.dominantHue).toBe(expected.dominantHue);

            expectNear(
              actual.foregroundCoverage,
              expected.foregroundCoverage,
              goldens.numericTolerances.foregroundCoverage,
              name + '.pdf page ' + pageIndex + ' foregroundCoverage',
            );
            expectNear(
              actual.polarityConfidence,
              expected.polarityConfidence,
              goldens.numericTolerances.polarityConfidence,
              name + '.pdf page ' + pageIndex + ' polarityConfidence',
            );
            expect(actual.sparseContent).toBe(expected.sparseContent);
            expect(actual.coloredAnnotationPresent).toBe(expected.coloredAnnotationPresent);
            expect(actual.thinStrokeRisk).toBe(expected.thinStrokeRisk);
            expectNear(
              actual.longLineDensity,
              expected.longLineDensity,
              goldens.numericTolerances.longLineDensity,
              name + '.pdf page ' + pageIndex + ' longLineDensity',
            );
            expectNear(
              actual.diagramEquationScore,
              expected.diagramEquationScore,
              goldens.numericTolerances.diagramEquationScore,
              name + '.pdf page ' + pageIndex + ' diagramEquationScore',
            );
            if (actual.contentBoundingBox || expected.contentBoundingBox) {
              expect(actual.contentBoundingBox).toBeDefined();
              expect(expected.contentBoundingBox).toBeDefined();
              expectNear(actual.contentBoundingBox!.xMin, expected.contentBoundingBox!.xMin, goldens.numericTolerances.bbox, name + '.pdf page ' + pageIndex + ' bbox.xMin');
              expectNear(actual.contentBoundingBox!.yMin, expected.contentBoundingBox!.yMin, goldens.numericTolerances.bbox, name + '.pdf page ' + pageIndex + ' bbox.yMin');
              expectNear(actual.contentBoundingBox!.xMax, expected.contentBoundingBox!.xMax, goldens.numericTolerances.bbox, name + '.pdf page ' + pageIndex + ' bbox.xMax');
              expectNear(actual.contentBoundingBox!.yMax, expected.contentBoundingBox!.yMax, goldens.numericTolerances.bbox, name + '.pdf page ' + pageIndex + ' bbox.yMax');
            }

            expectNear(
              actual.inkDensity,
              expected.inkDensity,
              goldens.numericTolerances.inkDensity,
              name + '.pdf page ' + pageIndex + ' inkDensity',
            );
            expectNear(
              actual.edgeDensity,
              expected.edgeDensity,
              goldens.numericTolerances.edgeDensity,
              name + '.pdf page ' + pageIndex + ' edgeDensity',
            );
            expectNear(
              actual.colorfulPixelRatio,
              expected.colorfulPixelRatio,
              goldens.numericTolerances.colorfulPixelRatio,
              name + '.pdf page ' + pageIndex + ' colorfulPixelRatio',
            );
            expectNear(
              actual.estimatedNoise,
              expected.estimatedNoise,
              goldens.numericTolerances.estimatedNoise,
              name + '.pdf page ' + pageIndex + ' estimatedNoise',
            );
            expectNear(
              actual.strokeThickness,
              expected.strokeThickness,
              goldens.numericTolerances.strokeThickness,
              name + '.pdf page ' + pageIndex + ' strokeThickness',
            );
          }
        } finally {
          await doc.destroy();
        }
      }, 300_000);
    }

    it('goldens cover every committed fixture', () => {
      for (const name of FIXTURE_NAMES) {
        expect(Object.keys(goldens.fixtures[name] ?? {}).length).toBeGreaterThan(0);
        expect(readFixture(name).length).toBeGreaterThan(0);
      }
    });
  },
);
