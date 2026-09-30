import { describe, it, expect } from 'vitest';
import { ParameterGenerator } from '../../lib/optimizer/parameterGenerator';
import { PresetMode } from '../../lib/optimizer/types';

describe('ParameterGenerator', () => {
  it('adapts dark lecture slides without changing explicit presets', () => {
    const dark = ParameterGenerator.getPresetParameters('PW_DARK_SLIDE');

    const sparseThin = ParameterGenerator.adaptAutoPageParameters(
      { ...dark },
      {
        pageIndex: 0,
        width: 320,
        height: 180,
        averageBrightness: 28,
        contrast: 30,
        inkDensity: 0.12,
        darkBackgroundRatio: 0.9,
        lightBackgroundRatio: 0.1,
        dominantHue: 90,
        hasTopBanner: false,
        topBannerHeightPct: 0,
        hasBottomBanner: false,
        bottomBannerHeightPct: 0,
        estimatedNoise: 8,
        strokeThickness: 1.8,
        density: 'sparse',
        thinStrokeRisk: true,
        classification: 'DARK_SLIDE',
      },
    );

    expect(sparseThin.sharpenAmount).toBe(40);
    expect(sparseThin.denoiseAmount).toBe(10);
    expect(sparseThin.dilationKernelSize).toBe(3);
    expect(sparseThin.strokeEnhancement).toBe('normal');

    const dense = ParameterGenerator.adaptAutoPageParameters(
      { ...dark },
      {
        pageIndex: 1,
        width: 320,
        height: 180,
        averageBrightness: 34,
        contrast: 42,
        inkDensity: 0.35,
        darkBackgroundRatio: 0.82,
        lightBackgroundRatio: 0.18,
        dominantHue: 120,
        hasTopBanner: false,
        topBannerHeightPct: 0,
        hasBottomBanner: false,
        bottomBannerHeightPct: 0,
        estimatedNoise: 42,
        strokeThickness: 2.8,
        density: 'dense',
        thinStrokeRisk: false,
        classification: 'DARK_SLIDE',
      },
    );

    expect(dense.sharpenAmount).toBe(30);
    expect(dense.denoiseAmount).toBe(12);
    expect(dense.dilationKernelSize).toBe(5);
    expect(dense.strokeEnhancement).toBe('strong');

    expect(ParameterGenerator.adaptAutoPageParameters(
      { ...ParameterGenerator.getPresetParameters('LIGHT_HANDWRITTEN') },
      {
        pageIndex: 2,
        width: 100,
        height: 100,
        averageBrightness: 230,
        contrast: 20,
        inkDensity: 0.1,
        darkBackgroundRatio: 0,
        lightBackgroundRatio: 0.9,
        dominantHue: 0,
        hasTopBanner: false,
        topBannerHeightPct: 0,
        hasBottomBanner: false,
        bottomBannerHeightPct: 0,
        estimatedNoise: 5,
        strokeThickness: 1.8,
        density: 'sparse',
        classification: 'LIGHT_SLIDE',
      },
    ).sharpenAmount).toBe(40);
  });

  it('adapts diagram/equation pages around thin structure', () => {
    const diagram = ParameterGenerator.getPresetParameters('DIAGRAM_HIGH_CONTRAST');
    const thin = ParameterGenerator.adaptAutoPageParameters(
      { ...diagram },
      {
        pageIndex: 0,
        width: 320,
        height: 180,
        averageBrightness: 38,
        contrast: 55,
        inkDensity: 0.18,
        darkBackgroundRatio: 0.78,
        lightBackgroundRatio: 0.22,
        dominantHue: 60,
        hasTopBanner: false,
        topBannerHeightPct: 0,
        hasBottomBanner: false,
        bottomBannerHeightPct: 0,
        estimatedNoise: 3,
        strokeThickness: 1.7,
        density: 'medium',
        thinStrokeRisk: true,
        classification: 'DIAGRAM_EQUATION',
      },
    );

    expect(thin.contrastEnhancement).toBe(35);
    expect(thin.sharpenAmount).toBe(50);
    expect(thin.denoiseAmount).toBe(10);
    expect(thin.dilationKernelSize).toBe(0);
    expect(thin.strokeEnhancement).toBe('none');
  });


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
