import { describe, it, expect } from 'vitest';
import { ParameterGenerator } from '../../lib/optimizer/parameterGenerator';
import { PresetMode } from '../../lib/optimizer/types';

describe('ParameterGenerator', () => {
  const presets: PresetMode[] = ['PW_DARK_SLIDE', 'LIGHT_HANDWRITTEN', 'SCREENSHOT_PRINT', 'INK_SAVER_EXTREME', 'DIAGRAM_HIGH_CONTRAST', 'AUTO_ADAPTIVE'];

  it('should return valid parameters for all presets', () => {
    for (const preset of presets) {
      const params = ParameterGenerator.getPresetParameters(preset);
      expect(params.preset).toBe(preset);
      expect(params.backgroundWhiteningThreshold).toBeGreaterThan(0);
      expect(params.contrastEnhancement).toBeGreaterThanOrEqual(0);
      expect(params.sharpenAmount).toBeGreaterThanOrEqual(0);
      expect(params.denoiseAmount).toBeGreaterThanOrEqual(0);
      expect(params.outputQuality).toBeGreaterThan(0);
      expect(params.outputQuality).toBeLessThanOrEqual(1);
    }
  });

  it('should have distinct configurations for different presets', () => {
    const darkSlide = ParameterGenerator.getPresetParameters('PW_DARK_SLIDE');
    const lightHandwritten = ParameterGenerator.getPresetParameters('LIGHT_HANDWRITTEN');
    expect(darkSlide.invertMode).toBe('smart');
    expect(lightHandwritten.invertMode).toBe('none');
    const screenshot = ParameterGenerator.getPresetParameters('SCREENSHOT_PRINT');
    expect(screenshot.invertMode).toBe('none');
    expect(screenshot.smartColorMapping).toBe(false);
    expect(screenshot.dilationKernelSize).toBe(0);
    expect(screenshot.contrastEnhancement).toBeLessThan(lightHandwritten.contrastEnhancement);
  });

  it('tunes screenshot recipe from page density and noise only for Auto mode', () => {
    const screenshot = ParameterGenerator.getPresetParameters('SCREENSHOT_PRINT');

    const sparse = ParameterGenerator.adaptAutoPageParameters(
      { ...screenshot },
      {
        pageIndex: 0,
        width: 100,
        height: 100,
        averageBrightness: 235,
        contrast: 30,
        inkDensity: 0.08,
        darkBackgroundRatio: 0,
        lightBackgroundRatio: 0.92,
        dominantHue: 0,
        hasTopBanner: false,
        topBannerHeightPct: 0,
        hasBottomBanner: false,
        bottomBannerHeightPct: 0,
        estimatedNoise: 5,
        strokeThickness: 1.5,
        density: 'sparse',
        classification: 'SCREENSHOT_HEAVY',
      },
    );

    const noisyDense = ParameterGenerator.adaptAutoPageParameters(
      { ...screenshot },
      {
        pageIndex: 1,
        width: 100,
        height: 100,
        averageBrightness: 205,
        contrast: 45,
        inkDensity: 0.6,
        darkBackgroundRatio: 0,
        lightBackgroundRatio: 0.4,
        dominantHue: 0,
        hasTopBanner: false,
        topBannerHeightPct: 0,
        hasBottomBanner: false,
        bottomBannerHeightPct: 0,
        estimatedNoise: 55,
        strokeThickness: 2.2,
        density: 'dense',
        classification: 'SCREENSHOT_HEAVY',
      },
    );

    expect(sparse.sharpenAmount).toBe(30);
    expect(sparse.denoiseAmount).toBe(5);
    expect(noisyDense.sharpenAmount).toBe(20);
    expect(noisyDense.denoiseAmount).toBe(10);

    const photoScan = ParameterGenerator.adaptAutoPageParameters(
      { ...screenshot },
      {
        pageIndex: 3,
        width: 100,
        height: 100,
        averageBrightness: 220,
        contrast: 42,
        inkDensity: 0.2,
        darkBackgroundRatio: 0,
        lightBackgroundRatio: 0.8,
        dominantHue: 0,
        hasTopBanner: false,
        topBannerHeightPct: 0,
        hasBottomBanner: false,
        bottomBannerHeightPct: 0,
        estimatedNoise: 4,
        strokeThickness: 2.4,
        density: 'medium',
        rasterSource: 'photo-scan',
        classification: 'SCREENSHOT_HEAVY',
      },
    );

    expect(photoScan.sharpenAmount).toBe(15);
    expect(photoScan.denoiseAmount).toBe(12);

    const explicit = ParameterGenerator.adaptAutoPageParameters(
      ParameterGenerator.getPresetParameters('LIGHT_HANDWRITTEN'),
      {
        pageIndex: 2,
        width: 100,
        height: 100,
        averageBrightness: 235,
        contrast: 30,
        inkDensity: 0.08,
        darkBackgroundRatio: 0,
        lightBackgroundRatio: 0.92,
        dominantHue: 0,
        hasTopBanner: false,
        topBannerHeightPct: 0,
        hasBottomBanner: false,
        bottomBannerHeightPct: 0,
        estimatedNoise: 55,
        strokeThickness: 1.5,
        density: 'sparse',
        classification: 'LIGHT_SLIDE',
      },
    );

    expect(explicit.preset).toBe('LIGHT_HANDWRITTEN');
    expect(explicit.sharpenAmount).toBe(40);
    expect(explicit.denoiseAmount).toBe(20);
  });
});
