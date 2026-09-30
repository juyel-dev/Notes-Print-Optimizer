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
const FIXTURE_PAGES: Record<(typeof FIXTURE_NAMES)[number], number[]> = {
  text: [2, 3, 4, 5],
  image: [0],
  scanned: [0],
  mixed: [0, 3],
};
const RENDER_SCALE = 1.2;

function readFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES_DIR, name + '.pdf')));
}

describe('production Auto recipe calibration', () => {
  for (const name of FIXTURE_NAMES) {
    it('keeps the full Auto pipeline safe on ' + name + '.pdf', async () => {
      const doc = await openPdfDocument(readFixture(name));

      try {
        for (const pageIndex of FIXTURE_PAGES[name]) {
          expect(pageIndex).toBeLessThan(doc.numPages);
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

          /*
           * Difficult source pages may legitimately make the guard retry.
           * The important invariant is that a flagged page still retains
           * measurable foreground/edge structure and the retry path ran.
           */
          if (assessment.likelyDamaged) {
            expect(production.preservationGuardTriggered).toBe(true);
            expect(assessment.coverageRatio).toBeGreaterThan(0);
            expect(assessment.edgeRatio).toBeGreaterThan(0);
          }

          if (profile.classification === 'DARK_SLIDE') {
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
            expect(production.params.dilationKernelSize).toBe(0);
            expect(production.params.strokeEnhancement).toBe('none');
          }

        }
      } finally {
        await doc.destroy();
      }

    }, 300_000);
  }
});
