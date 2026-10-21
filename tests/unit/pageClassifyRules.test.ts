import { describe, expect, it } from 'vitest';
import { classifyDensity, classifyPage, type ClassifyPageInput } from '@/lib/optimizer/profile/classify';

/**
 * The classification decision tree now lives in profile/classify.ts so it can be
 * tested on its own. The extraction itself was proven behavior-preserving by an
 * old-vs-new differential run over ~2000 pages (synthetic ratio sweeps + real PDF
 * fixtures, exact JSON equality); these cases pin the individual rules.
 */
const base: ClassifyPageInput = {
  colorfulPixelRatio: 0, edgeDensity: 0.05,
  foregroundStructure: { longLineDensity: 0, diagramEquationScore: 0 },
  isDarkSource: false, contrast: 40, inkDensity: 0.1,
  pagePolarity: { polarity: 'dark-on-light' },
  foregroundCoverage: 0.05, darkBgRatio: 0.02, lightBgRatio: 0.9, isolatedForegroundRatio: 0.1,
};
const c = (over: Partial<ClassifyPageInput>) => classifyPage({ ...base, ...over });

describe('classifyDensity', () => {
  it('dense / sparse / medium boundaries', () => {
    expect(classifyDensity(0.15, 0)).toBe('dense');
    expect(classifyDensity(0, 0.25)).toBe('dense');
    expect(classifyDensity(0.03, 0.1)).toBe('sparse');
    expect(classifyDensity(0.031, 0.1)).toBe('medium');
    expect(classifyDensity(0.05, 0.05)).toBe('medium');
  });
});

describe('classifyPage decision tree', () => {
  it('plain light page is a LIGHT_SLIDE', () => expect(c({})).toBe('LIGHT_SLIDE'));
  it('mixed polarity always wins', () =>
    expect(c({ pagePolarity: { polarity: 'mixed' }, darkBgRatio: 0.9 })).toBe('MIXED'));
  it('mostly dark background is a DARK_SLIDE', () =>
    expect(c({ isDarkSource: true, pagePolarity: { polarity: 'light-on-dark' }, darkBgRatio: 0.8, lightBgRatio: 0.05, contrast: 50 })).toBe('DARK_SLIDE'));
  it('very high contrast on a light page is a DIAGRAM_EQUATION', () =>
    expect(c({ contrast: 70 })).toBe('DIAGRAM_EQUATION'));
  it('busy, colourful, low-contrast light page is SCREENSHOT_HEAVY', () =>
    expect(c({ edgeDensity: 0.1, colorfulPixelRatio: 0.03, inkDensity: 0.5, lightBgRatio: 0.5, darkBgRatio: 0.1 })).toBe('SCREENSHOT_HEAVY'));
  it('inky, calm, non-colourful page with few isolated dots is HANDWRITTEN_NOTES', () =>
    expect(c({ inkDensity: 0.7, lightBgRatio: 0.3, darkBgRatio: 0.2, edgeDensity: 0.05, colorfulPixelRatio: 0.01, isolatedForegroundRatio: 0.2, contrast: 40 })).toBe('HANDWRITTEN_NOTES'));
  it('threshold band: lightBgRatio just above 0.65 is LIGHT, at 0.65 it is not', () => {
    expect(c({ lightBgRatio: 0.66, darkBgRatio: 0.1 })).toBe('LIGHT_SLIDE');
    expect(c({ lightBgRatio: 0.65, darkBgRatio: 0.1, inkDensity: 0.35 })).not.toBe('LIGHT_SLIDE');
  });
});
