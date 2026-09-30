/**
 * Shared helpers for fixture-driven tests and benches.
 *
 * applyEngineRecipe() is the ONE place that mirrors the production recipe
 * used by ProcessingEngineV2 (classification -> preset -> main-thread JS
 * pipeline). The golden suite and the Node baseline both call it, so the
 * recipe can never drift between coverage and timing.
 */
import { analyzeImageData } from '../../lib/optimizer/analysis';
import type { PageProfile } from '../../lib/optimizer/types';
import { ParameterGenerator } from '../../lib/optimizer/parameterGenerator';
import { selectPresetForPage } from '../../lib/optimizer/recipeSelector';
import { resolveEffectiveInvertMode } from '../../lib/optimizer/engine/v2/resolveInvertMode';
import { processPage, type KernelProcessResult } from '../../lib/kernels/processPage';
import { processPageWithWhiteBoxHeal } from '../../lib/kernels/whiteBox';

export interface RecipeOutput {
  profile: PageProfile;
  params: ReturnType<typeof ParameterGenerator.getPresetParameters>;
  result: KernelProcessResult;
}

export function applyEngineRecipe(imageData: ImageData, pageIndex: number): RecipeOutput {
  const profile = analyzeImageData(imageData, pageIndex);
  /* Mirror ProcessingEngineV2 Phase 3: page-aware preset + per-page smart
     resolution. Keeps golden coverage from drifting off production. */
  const preset = selectPresetForPage(profile);
  const baseParams = ParameterGenerator.getPresetParameters(preset);
  const params = {
    ...baseParams,
    preset,
    invertMode: resolveEffectiveInvertMode(baseParams.invertMode, profile.classification),
  };
  const result = processPage(imageData.data, imageData.width, imageData.height, params, {
    classification: profile.classification,
    darkBackgroundRatio: profile.darkBackgroundRatio,
  });
  return { profile, params, result };
}

/** Fraction (x100, 2 decimals) of pixels whose red channel is darker than 128. */
export function countInk(rgba: Uint8Array | Uint8ClampedArray): number {
  let dark = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i] < 128) dark++;
  }
  return Math.round((dark / (rgba.length / 4)) * 10000) / 100;
}

export interface ProductionRecipeOutput extends RecipeOutput {
  preservationGuardTriggered: boolean;
  whiteBoxRegions: number;
}

export function applyProductionAutoRecipe(
  imageData: ImageData,
  pageIndex: number,
): ProductionRecipeOutput {
  const profile = analyzeImageData(imageData, pageIndex);
  const preset = selectPresetForPage(profile);
  const baseParams = ParameterGenerator.getPresetParameters(preset);
  const autoTunedParams = ParameterGenerator.adaptAutoPageParameters(baseParams, profile);
  const params = {
    ...autoTunedParams,
    preset,
    invertMode: resolveEffectiveInvertMode(baseParams.invertMode, profile.classification),
  };
  const result = processPageWithWhiteBoxHeal(
    imageData.data,
    imageData.width,
    imageData.height,
    params,
    profile,
  );

  return {
    profile,
    params,
    result,
    preservationGuardTriggered: result.preservationGuardTriggered ?? false,
    whiteBoxRegions: result.whiteBoxRegions.length,
  };
}
