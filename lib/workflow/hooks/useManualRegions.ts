'use client';

import { useCallback, useEffect, useRef } from 'react';
import { LayoutService } from '../../services/LayoutService';
import type { LayoutConfig, ProcessedPage } from '../../optimizer/types';
import type { WhiteBoxRegion } from '../../kernels/whiteBox';
import type { WorkflowActions } from '../useWorkflow';

interface ManualRegionsParams {
  processedPages: ProcessedPage[];
  excludedPages: Set<number>;
  manualWhiteBoxRegions: Record<number, WhiteBoxRegion[]>;
  keepOriginalPages: Set<number>;
  mergedPdfBytes: Uint8Array | null;
  layoutConfig: LayoutConfig;
  currentPhase: number;
  actions: WorkflowActions;
  compilePhase3PrintLayout: (
    config: LayoutConfig,
    overrideExcludedPages?: Set<number>,
    overrideKeepOriginal?: Set<number>,
    overrideManualRegions?: Record<number, WhiteBoxRegion[]>,
  ) => Promise<void>;
  excludeLayoutTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  excludeLayoutArgsRef: React.MutableRefObject<{
    config: LayoutConfig;
    excluded: Set<number>;
    keepOriginal: Set<number>;
    manualRegions: Record<number, WhiteBoxRegion[]>;
  } | null>;
}

/**
 * Manual white-box regions: user-drawn rects/ellipses that the auto detector
 * missed. Edits are tiny JSON (x,y,w,h,shape) — no image duplication.
 * Export composites them at export time; the hook also debounces a
 * phase-3 re-layout so sheet previews reflect the edit.
 */
export function useManualRegions({
  processedPages,
  excludedPages,
  manualWhiteBoxRegions,
  keepOriginalPages,
  mergedPdfBytes,
  layoutConfig,
  currentPhase,
  actions,
  compilePhase3PrintLayout,
  excludeLayoutTimerRef,
  excludeLayoutArgsRef,
}: ManualRegionsParams) {
  const thumbnailRequestIdsRef = useRef(new Map<number, number>());

  useEffect(() => () => {
    thumbnailRequestIdsRef.current.forEach((requestId, pageIndex) => {
      thumbnailRequestIdsRef.current.set(pageIndex, requestId + 1);
    });
  }, []);

  const scheduleRelayout = useCallback(
    (nextManual: Record<number, WhiteBoxRegion[]>) => {
      if (!(currentPhase === 3 && processedPages.length > 0)) return;
      const activePages = LayoutService.getActivePages(processedPages, excludedPages);
      if (activePages.length === 0) return;
      excludeLayoutArgsRef.current = {
        config: layoutConfig,
        excluded: excludedPages,
        keepOriginal: keepOriginalPages,
        manualRegions: nextManual,
      };
      if (excludeLayoutTimerRef.current) clearTimeout(excludeLayoutTimerRef.current);
      excludeLayoutTimerRef.current = setTimeout(() => {
        excludeLayoutTimerRef.current = null;
        const args = excludeLayoutArgsRef.current;
        if (args) compilePhase3PrintLayout(args.config, args.excluded, args.keepOriginal, args.manualRegions);
      }, 400);
    },
    [currentPhase, processedPages, excludedPages, keepOriginalPages, layoutConfig, compilePhase3PrintLayout, excludeLayoutTimerRef, excludeLayoutArgsRef],
  );

  const regenerateThumbnail = useCallback(async (pageIndex: number, regions: WhiteBoxRegion[]) => {
    const page = processedPages.find((p) => p.pageIndex === pageIndex);
    if (!page) return;
    const requestId = (thumbnailRequestIdsRef.current.get(pageIndex) ?? 0) + 1;
    thumbnailRequestIdsRef.current.set(pageIndex, requestId);
    let srcCanvas: HTMLCanvasElement | null = null;
    let thumbCanvas: HTMLCanvasElement | null = null;
    try {
      const { PdfExporter } = await import('../../optimizer/pdfExporter');
      const { compositeWhiteBoxRegions } = await import('../../kernels/whiteBox');
      const { memoryManager } = await import('../../optimizer/memoryManager');
      // Load current optimized (auto-healed, CROPPED) and original (FULL) at same width.
      // Regions are CROPPED coords → offset src by banner crop.
      const opt = await PdfExporter.loadOptimizedImageData(page);
      let displayData = opt;
      if (regions.length > 0 && mergedPdfBytes) {
        const orig = await PdfExporter.loadOriginalImageData(page, mergedPdfBytes, opt.width);
        const cTop = Math.floor(orig.height * ((page.parameters.bannerCropTopPct ?? 0) / 100));
        const cBot = Math.floor(orig.height * ((page.parameters.bannerCropBottomPct ?? 0) / 100));
        const croppedH = orig.height - cTop - cBot;
        const wDiff = Math.abs(orig.width - opt.width);
        const hDiff = Math.abs(croppedH - opt.height);
        if (wDiff > 2 || hDiff > 2) {
          console.warn(`[manualRegions] Dimension mismatch for thumbnail regen page ${page.pageIndex + 1}: opt ${opt.width}x${opt.height} vs orig cropped ${orig.width}x${croppedH} (full ${orig.width}x${orig.height} cTop=${cTop} cBot=${cBot}) wDiff=${wDiff} hDiff=${hDiff} — compositing anyway`);
        }
        const { denormalizeRegions } = await import('../../kernels/whiteBox');
        const pixelRegs = denormalizeRegions(regions, opt.width, opt.height);
        compositeWhiteBoxRegions(opt.data, orig.data, opt.width, opt.height, pixelRegs, cTop);
        displayData = opt;
      }
      // Downscale to thumbnail (same as ProcessingEngineV2.generateThumbnail 1/5)
      const tw = Math.max(1, Math.round(displayData.width / 5));
      const th = Math.max(1, Math.round(displayData.height / 5));
      srcCanvas = document.createElement('canvas');
      srcCanvas.width = displayData.width;
      srcCanvas.height = displayData.height;
      const srcCtx = srcCanvas.getContext('2d');
      if (!srcCtx) throw new Error('Could not initialize manual-region source canvas.');
      srcCtx.putImageData(displayData, 0, 0);

      thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = tw;
      thumbCanvas.height = th;
      const thumbCtx = thumbCanvas.getContext('2d');
      if (!thumbCtx) throw new Error('Could not initialize manual-region thumbnail canvas.');
      thumbCtx.drawImage(srcCanvas, 0, 0, tw, th);

      const blob = await new Promise<Blob>((resolve, reject) => {
        thumbCanvas!.toBlob((encoded) => {
          if (encoded && encoded.size > 0) resolve(encoded);
          else reject(new Error('Could not encode the manual-region thumbnail.'));
        }, 'image/jpeg', 0.6);
      });

      // A newer edit may have completed while this page was rendering/encoding.
      // Never replace the latest thumbnail with an older snapshot.
      if (thumbnailRequestIdsRef.current.get(pageIndex) !== requestId) return;

      // Revoke the old thumbnail only after a valid replacement is ready.
      const newUrl = memoryManager.createTrackedBlobUrl(blob);
      const updated: ProcessedPage = { ...page, thumbnailDataUrl: newUrl };
      memoryManager.revokeBlobUrl(page.thumbnailDataUrl);
      actions.updateSingleProcessedPage(pageIndex, updated);
    } catch (e) {
      console.warn('[manualRegions] thumbnail regen failed for page', pageIndex, e);
    } finally {
      if (srcCanvas) { srcCanvas.width = 0; srcCanvas.height = 0; }
      if (thumbCanvas) { thumbCanvas.width = 0; thumbCanvas.height = 0; }
    }
  }, [processedPages, mergedPdfBytes, actions]);

  const handleSetManualRegions = useCallback(
    (pageIndex: number, regions: WhiteBoxRegion[]) => {
      actions.setManualWhiteBoxRegions(pageIndex, regions);
      const nextManual = { ...manualWhiteBoxRegions };
      if (regions.length === 0) delete nextManual[pageIndex];
      else nextManual[pageIndex] = regions;
      scheduleRelayout(nextManual);
      // Fire-and-forget thumbnail refresh so the grid shows the edit
      void regenerateThumbnail(pageIndex, regions);
    },
    [manualWhiteBoxRegions, actions, scheduleRelayout, regenerateThumbnail],
  );

  const handleClearManualRegions = useCallback(
    (pageIndex: number) => {
      actions.clearManualWhiteBoxRegions(pageIndex);
      const nextManual = { ...manualWhiteBoxRegions };
      delete nextManual[pageIndex];
      scheduleRelayout(nextManual);
      void regenerateThumbnail(pageIndex, []);
    },
    [manualWhiteBoxRegions, actions, scheduleRelayout, regenerateThumbnail],
  );

  return { handleSetManualRegions, handleClearManualRegions };
}
