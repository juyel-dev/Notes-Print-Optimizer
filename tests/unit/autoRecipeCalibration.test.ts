import { describe, expect, it } from 'vitest';
import { join } from 'path';
import { readFileSync } from 'fs';
import {
  applyProductionAutoRecipe,
  countInk,
} from '../fixtures/pdfMetrics';
import { assessPreservation } from '../../lib/kernels/preservationGuard';
import { selectPresetForPage } from '../../lib/optimizer/recipeSelector';
import { openPdfDocument, renderPdfPageOpen } from '../fixtures/pdfRender';

const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'pdf');
const FIXTURE_NAMES = ['text', 'image', 'scanned', 'mixed'] as const;
const RENDER_SCALE = 1.2;

function readFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES_DIR, name + '.pdf')));
}

describe('production Auto recipe calibration', () => {
  for (const name of FIXTURE_NAMES) {
    it('keeps the full Auto pipeline safe on ' + name + '.pdf', async () => {
      const doc = await openPdfDocument(readFixture(name));
      let darkPages = 0;
      let screenshotPages = 0;

      try {
        for (let pageIndex = 0; pageIndex < doc.numPages; pageIndex++) {
          const imageData = await renderPdfPageOpen(doc, pageIndex, RENDER_SCALE);
          const production = applyProductionAutoRecipe(imageData, pageIndex);
          const profile = production.profile;
          const beforeInk = countInk(imageData.data);
          const afterInk = countInk(new Uint8Array(production.result.buffer));

          expect(production.params.preset).toBe(selectPresetForPage(profile));
          expect(production.result.width).toBe(imageData.width);
          expect(production.result.height).toBe(imageData.height);

          const assessment = assessPreservation(
            imageData.data,
            imageData.width,
            imageData.height,
            new Uint8ClampedArray(production.result.buffer),
            production.result.width,
            production.result.height,
            profile,
          );
          expect(assessment.likelyDamaged).toBe(false);

          if (profile.classification === 'DARK_SLIDE') {
            darkPages++;
            expect(afterInk).toBeLessThan(beforeInk);

            if (profile.thinStrokeRisk || profile.density === 'sparse') {
              expect(production.params.dilationKernelSize).toBe(3);
              expect(production.params.strokeEnhancement).toBe('normal');
              expect(production.params.sharpenAmount).toBe(40);
            }
          } else {
            expect(afterInk).toBeLessThanOrEqual(beforeInk + 2);
          }

          if (profile.classification === 'SCREENSHOT_HEAVY') {
            screenshotPages++;
            expect(production.params.dilationKernelSize).toBe(0);
            expect(production.params.strokeEnhancement).toBe('none');
          }

        }
      } finally {
        await doc.destroy();
      }

      expect(darkPages + screenshotPages).toBeGreaterThan(0);
    }, 300_000);
  }
});
