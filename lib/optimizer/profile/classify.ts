// Page classification rules (decision logic moved verbatim from analyzeImageData).
import type { PageClassification, PageDensity } from '../types';
import { DARK_BG_RATIO_THRESHOLD } from '../../kernels/constants';
import type { ForegroundPolarity } from './polarity';
import type { ForegroundStructure } from './foreground';

export function classifyDensity(foregroundCoverage: number, edgeDensity: number): PageDensity {
  if (foregroundCoverage >= 0.15 || edgeDensity >= 0.25) return 'dense';
  if (foregroundCoverage <= 0.03 && edgeDensity <= 0.10) return 'sparse';
  return 'medium';
}

export interface ClassifyPageInput {
  colorfulPixelRatio: number;
  edgeDensity: number;
  foregroundStructure: ForegroundStructure;
  isDarkSource: boolean;
  contrast: number;
  inkDensity: number;
  pagePolarity: { polarity: ForegroundPolarity };
  foregroundCoverage: number;
  darkBgRatio: number;
  lightBgRatio: number;
  isolatedForegroundRatio: number;
}

/** Decision tree that maps measured page signals to a PageClassification. */
export function classifyPage(input: ClassifyPageInput): PageClassification {
  const {
    colorfulPixelRatio, edgeDensity, foregroundStructure, isDarkSource, contrast, inkDensity,
    pagePolarity, foregroundCoverage, darkBgRatio, lightBgRatio, isolatedForegroundRatio,
  } = input;

  const rasterScreenshotSignal =
    colorfulPixelRatio >= 0.02 &&
    edgeDensity >= 0.015 &&
    foregroundStructure.longLineDensity >= 0.04;

  const screenshotHeavy =
    !isDarkSource &&
    contrast <= 65 &&
    inkDensity < 0.85 &&
    (
      (
        edgeDensity >= 0.08 &&
        (colorfulPixelRatio >= 0.02 || contrast >= 25)
      ) ||
      rasterScreenshotSignal
    );

  const diagramEquationSignal =
    isDarkSource &&
    pagePolarity.polarity !== 'mixed' &&
    foregroundCoverage >= 0.02 &&
    (
      (
        foregroundStructure.diagramEquationScore >= 0.72 &&
        foregroundStructure.longLineDensity >= 0.025
      ) ||
      (
        foregroundStructure.longLineDensity >= 0.035 &&
        edgeDensity >= 0.04
      )
    );

  const balancedMixedPage =
    pagePolarity.polarity === 'mixed' ||
    (
      darkBgRatio <= DARK_BG_RATIO_THRESHOLD &&
      lightBgRatio >= 0.35 &&
      lightBgRatio <= 0.65 &&
      contrast >= 20 &&
      inkDensity >= 0.25
    );

  let classification: PageClassification;
  if (pagePolarity.polarity === 'mixed') {
    classification = 'MIXED';
  } else if (!isDarkSource && screenshotHeavy) {
    classification = 'SCREENSHOT_HEAVY';
  } else if ((!isDarkSource && contrast > 65) || diagramEquationSignal) {
    classification = 'DIAGRAM_EQUATION';
  } else if (darkBgRatio > DARK_BG_RATIO_THRESHOLD) {
    classification = 'DARK_SLIDE';
  } else if (screenshotHeavy) {
    classification = 'SCREENSHOT_HEAVY';
  } else if (darkBgRatio < 0.15 && lightBgRatio > 0.65) {
    classification = 'LIGHT_SLIDE';
  } else if (
    balancedMixedPage ||
    (inkDensity > 0.35 && (colorfulPixelRatio > 0.08 || edgeDensity > 0.20))
  ) {
    classification = 'MIXED';
  } else if (
    inkDensity > 0.35 &&
    colorfulPixelRatio < 0.08 &&
    isolatedForegroundRatio < 0.45 &&
    edgeDensity < 0.20
  ) {
    classification = 'HANDWRITTEN_NOTES';
  } else {
    classification = 'MIXED';
  }

  return classification;
}
