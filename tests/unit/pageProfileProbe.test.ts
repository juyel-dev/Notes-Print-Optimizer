/**
 * Temporary analyzer probe used to capture real-fixture page profiles before
 * the semantic golden snapshots are committed.
 *
 * Remove this file after pageProfileGoldens.json is frozen.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { analyzeImageData } from '../../lib/optimizer/analysis';
import { openPdfDocument, renderPdfPageOpen } from '../fixtures/pdfRender';

const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'pdf');
const RENDER_SCALE = 1.8;
const FIXTURE_NAMES = ['text', 'image', 'scanned', 'mixed'] as const;

describe('real fixture page profile probe', () => {
  it('prints analyzer snapshots for all committed PDF fixture pages', async () => {
    const payload: Record<string, Record<string, Record<string, unknown>>> = {};

    for (const name of FIXTURE_NAMES) {
      const bytes = new Uint8Array(readFileSync(join(FIXTURES_DIR, name + '.pdf')));
      const doc = await openPdfDocument(bytes);
      payload[name] = {};

      try {
        for (let pageIndex = 0; pageIndex < doc.numPages; pageIndex++) {
          const imageData = await renderPdfPageOpen(doc, pageIndex, RENDER_SCALE);
          const profile = analyzeImageData(imageData, pageIndex);

          payload[name][String(pageIndex)] = {
            width: profile.width,
            height: profile.height,
            classification: profile.classification,
            density: profile.density,
            foregroundPolarity: profile.foregroundPolarity,
            dominantHue: profile.dominantHue,
            edgeDensity: profile.edgeDensity,
            colorfulPixelRatio: profile.colorfulPixelRatio,
            estimatedNoise: profile.estimatedNoise,
            strokeThickness: profile.strokeThickness,
            inkDensity: profile.inkDensity,
          };
        }
      } finally {
        await doc.destroy();
      }
    }

    console.log(
      'PROFILE_GOLDEN_PAYLOAD=' +
        JSON.stringify({ version: 1, renderScale: RENDER_SCALE, fixtures: payload }),
    );

    expect(Object.keys(payload)).toHaveLength(FIXTURE_NAMES.length);
  }, 300_000);
});
