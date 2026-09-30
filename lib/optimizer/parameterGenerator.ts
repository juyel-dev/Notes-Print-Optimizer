import {
  PageProfile,
  PresetMode,
  ProcessingParameters,
} from './types';

export class ParameterGenerator {
  /**
   * Returns default parameter configuration for a given preset
   */
  public static getPresetParameters(preset: PresetMode): ProcessingParameters {
    switch (preset) {
      case 'PW_DARK_SLIDE':
        return {
          preset: 'PW_DARK_SLIDE',
          invertMode: 'smart',
          smartColorMapping: true,
          backgroundWhiteningThreshold: 220,
          contrastEnhancement: 25,
          sharpenAmount: 35,
          denoiseAmount: 15,
          bannerCropTopPct: 0,
          bannerCropBottomPct: 0,
          autoTrimMargins: false,
          binaizationThreshold: 0,
          outputQuality: 0.88,
          strokeEnhancement: 'strong',
          dilationKernelSize: 5,
        };

      case 'LIGHT_HANDWRITTEN':
        return {
          preset: 'LIGHT_HANDWRITTEN',
          invertMode: 'none',
          smartColorMapping: false,
          backgroundWhiteningThreshold: 200,
          contrastEnhancement: 35,
          sharpenAmount: 40,
          denoiseAmount: 20,
          bannerCropTopPct: 0,
          bannerCropBottomPct: 0,
          autoTrimMargins: false,
          binaizationThreshold: 0,
          outputQuality: 0.88,
          strokeEnhancement: 'normal',
          dilationKernelSize: 3,
        };

      case 'SCREENSHOT_PRINT':
        return {
          preset: 'SCREENSHOT_PRINT',
          invertMode: 'none',
          smartColorMapping: false,
          backgroundWhiteningThreshold: 215,
          contrastEnhancement: 20,
          sharpenAmount: 25,
          denoiseAmount: 5,
          bannerCropTopPct: 0,
          bannerCropBottomPct: 0,
          autoTrimMargins: false,
          binaizationThreshold: 0,
          outputQuality: 0.90,
          strokeEnhancement: 'none',
          dilationKernelSize: 0,
        };

      case 'INK_SAVER_EXTREME':
        return {
          preset: 'INK_SAVER_EXTREME',
          invertMode: 'smart',
          smartColorMapping: true,
          backgroundWhiteningThreshold: 185,
          contrastEnhancement: 50,
          sharpenAmount: 50,
          denoiseAmount: 30,
          bannerCropTopPct: 0,
          bannerCropBottomPct: 0,
          autoTrimMargins: false,
          binaizationThreshold: 190,
          outputQuality: 0.80,
          strokeEnhancement: 'strong',
          dilationKernelSize: 5,
        };

      case 'DIAGRAM_HIGH_CONTRAST':
        return {
          preset: 'DIAGRAM_HIGH_CONTRAST',
          invertMode: 'smart',
          smartColorMapping: true,
          backgroundWhiteningThreshold: 230,
          contrastEnhancement: 45,
          sharpenAmount: 60,
          denoiseAmount: 10,
          bannerCropTopPct: 0,
          bannerCropBottomPct: 0,
          autoTrimMargins: false,
          binaizationThreshold: 0,
          outputQuality: 0.92,
          strokeEnhancement: 'none',
          dilationKernelSize: 0,
        };

      case 'AUTO_ADAPTIVE':
      default:
        return {
          preset: 'AUTO_ADAPTIVE',
          invertMode: 'smart',
          smartColorMapping: true,
          backgroundWhiteningThreshold: 220,
          contrastEnhancement: 20,
          sharpenAmount: 30,
          denoiseAmount: 15,
          bannerCropTopPct: 0,
          bannerCropBottomPct: 0,
          autoTrimMargins: false,
          binaizationThreshold: 0,
          outputQuality: 0.88,
          strokeEnhancement: 'strong',
          dilationKernelSize: 5,
        };
    }
  }

  /**
   * Applies conservative page-specific tuning only to Auto-selected recipes.
   * Explicit user presets remain unchanged at the engine boundary.
   */
  public static adaptAutoPageParameters(
    baseParams: ProcessingParameters,
    pageProfile: PageProfile,
  ): ProcessingParameters {
    const adaptivePresets = new Set<PresetMode>([
      'SCREENSHOT_PRINT',
      'PW_DARK_SLIDE',
      'DIAGRAM_HIGH_CONTRAST',
    ]);
    if (!adaptivePresets.has(baseParams.preset)) return baseParams;

    const density = pageProfile.density ?? (
      pageProfile.inkDensity >= 0.45
        ? 'dense'
        : pageProfile.inkDensity <= 0.12
          ? 'sparse'
          : 'medium'
    );

    let next = { ...baseParams };

    if (pageProfile.classification === 'SCREENSHOT_HEAVY') {
      next = {
        ...next,
        sharpenAmount: density === 'sparse' ? 30 : density === 'dense' ? 20 : 25,
        denoiseAmount: pageProfile.estimatedNoise >= 30 ? 10 : 5,
      };
    } else if (pageProfile.classification === 'DARK_SLIDE') {
      /*
       * Dark lecture slides contain the highest share of thin colored
       * handwriting in our target corpus. Keep the default strong stroke
       * recipe for normal pages, but avoid over-thickening sparse/thin pages.
       */
      const thin = pageProfile.thinStrokeRisk === true;
      next = {
        ...next,
        sharpenAmount: thin || density === 'sparse'
          ? 40
          : density === 'dense'
            ? 30
            : 35,
        denoiseAmount: thin ? 10 : pageProfile.estimatedNoise >= 30 ? 12 : 15,
        dilationKernelSize: thin || density === 'sparse' ? 3 : 5,
        strokeEnhancement: thin || density === 'sparse' ? 'normal' : 'strong',
      };
    } else if (pageProfile.classification === 'DIAGRAM_EQUATION') {
      /*
       * Structural pages need contrast, but thin lines should not be forced
       * through the medium dilation used by generic dark slides.
       */
      const thin = pageProfile.thinStrokeRisk === true;
      next = {
        ...next,
        contrastEnhancement: thin ? 35 : 45,
        sharpenAmount: thin ? 50 : 60,
        denoiseAmount: pageProfile.estimatedNoise >= 30 ? 8 : 10,
        dilationKernelSize: 0,
        strokeEnhancement: 'none',
      };
    }

    return next;
  }

}
