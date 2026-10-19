'use client';

import { useCallback, useRef } from 'react';
import { OptimizationService } from '../../services/OptimizationService';
import { pwOptimizerStorage } from '../../optimizer/storage';
import { memoryManager } from '../../optimizer/memoryManager';
import { getPdfjsLib } from '../../optimizer/pdfjsLoader';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ParameterGenerator } from '../../optimizer/parameterGenerator';
import type {
  PageProfile,
  ProcessedPage,
  ProcessingParameters,
} from '../../optimizer/types';
import type { ProcessingToggleState } from '../types';
import type { WorkflowActions } from '../useWorkflow';
import { DEFAULT_PROCESSING_TOGGLES } from '../types';
import { buildEffectiveParams } from './buildEffectiveParams';
import type { WithProcessingFn } from './useWorkflowRuntime';

interface OptimizationParams {
  mergedPdfBytes: Uint8Array | null;
  masterParams: ProcessingParameters;
  processingToggles: ProcessingToggleState;
  selectedPageIndex: number;
  processedPages: ProcessedPage[];
  pageProfiles: PageProfile[];
  actions: WorkflowActions & {
    updateSingleProcessedPage: (idx: number, page: ProcessedPage) => void;
  };
  abortRef: React.MutableRefObject<AbortController | null>;
  previewBlobUrlRef: React.MutableRefObject<string | null>;
  previewPdfDocRef: React.MutableRefObject<{ bytes: Uint8Array; doc: PDFDocumentProxy } | null>;
  withProcessing: WithProcessingFn;
  setProgressiveThumbnails: React.Dispatch<React.SetStateAction<Map<number, string>>>;
  clearProgressiveThumbnails: () => void;
}

/**
 * Phase-2 optimization domain: full-document processing, batch
 * re-process and the memory-guarded single-page preview reprocess.
 */
export function useOptimization({
  mergedPdfBytes,
  masterParams,
  processingToggles,
  selectedPageIndex,
  processedPages,
  pageProfiles,
  actions,
  abortRef,
  previewBlobUrlRef,
  previewPdfDocRef,
  withProcessing,
  setProgressiveThumbnails,
  clearProgressiveThumbnails,
}: OptimizationParams) {
  const handleProceedToPhase2 = useCallback(
    async () => {
      if (!mergedPdfBytes) return;
      const startTime = Date.now();
      const abortController = new AbortController();
      abortRef.current = abortController;
      const pdfId = `pw_doc_${Date.now()}`;
      clearProgressiveThumbnails();
      await withProcessing(async () => {
        const signal = abortController.signal;
        const service = new OptimizationService();
        const effectiveParams = buildEffectiveParams(masterParams, processingToggles);
        const { processedPages: pages, docProfile: dProf } = await service.processDocument(
          mergedPdfBytes.buffer.slice(
            mergedPdfBytes.byteOffset,
            mergedPdfBytes.byteOffset + mergedPdfBytes.byteLength,
          ) as ArrayBuffer,
          pdfId,
          effectiveParams.preset,
          (curr, total, action) => {
            if (signal.aborted) throw new Error('CANCELLED');
            actions.setProgress({
              stage: 'OPTIMIZING',
              currentPage: curr,
              totalPages: total,
              percent: Math.round((curr / total) * 100),
              currentAction: action,
              elapsedMs: Date.now() - startTime,
            });
          },
          (pageIndex, thumbUrl) => {
            setProgressiveThumbnails(prev => {
              const next = new Map(prev);
              next.set(pageIndex, thumbUrl);
              return next;
            });
          },
          effectiveParams,
        );
        if (signal.aborted) return;
        actions.setTiming({
          analysisTimeMs: Math.round((Date.now() - startTime) * 0.15),
          optimizationTimeMs: Math.round((Date.now() - startTime) * 0.85),
        });
        actions.setDocProfile(dProf);
        actions.setPageProfiles(dProf.pages);
        actions.setProcessedPages(pages);
        actions.setPhase(2);
      }, 'Processing failed due to browser memory limits.', null);
      // Failed/aborted runs may have reported progressive URLs that the engine
      // has now revoked. The old ProcessedPage thumbnails remain authoritative.
      clearProgressiveThumbnails();
      if (abortRef.current === abortController) abortRef.current = null;
    },
    [mergedPdfBytes, masterParams, processingToggles, actions, withProcessing, abortRef, setProgressiveThumbnails, clearProgressiveThumbnails],
  );

  /* ----------------------------------------------------------------
   * handlePreviewReprocess  -  SINGLE-PAGE PREVIEW PROCESSING
   *
   * Memory strategy: render ONLY the selected page, process it,
   * generate a small thumbnail blob URL, store the result in
   * IndexedDB, then release everything. The previous preview blob
   * URL is revoked before a new one is created.
   * ---------------------------------------------------------------- */
  /** Guards against overlapping preview-reprocess invocations. */
  const previewInFlightRef = useRef(false);

  const handlePreviewReprocess = useCallback(async () => {
    if (!mergedPdfBytes || mergedPdfBytes.length === 0 || processedPages.length === 0) return;
    const pageIndex = selectedPageIndex;
    if (pageIndex < 0 || pageIndex >= processedPages.length) return;
    if (previewInFlightRef.current) return; // already running — skip

    previewInFlightRef.current = true;
    actions.setPreviewProcessing(true);
    actions.setError(null);

    let rawCanvas: HTMLCanvasElement | null = null;
    let originalImageData: ImageData | null = null;
    let optimizedImageData: ImageData | null = null;
    let thumbCanvas: HTMLCanvasElement | null = null;
    let tmpCanvas: HTMLCanvasElement | null = null;
    let pendingThumbUrl: string | null = null;
    let renderedPdfPage: { cleanup: () => void } | null = null;

    try {
      const effectiveParams = buildEffectiveParams(masterParams, processingToggles);
      const { getProcessingEngine } = await import('../../optimizer/engine');
      const engine = getProcessingEngine();

      // Render ONLY the selected page from the cached or loaded PDF
      let pdfDoc =
        previewPdfDocRef.current?.bytes === mergedPdfBytes ? previewPdfDocRef.current.doc : null;
      if (!pdfDoc) {
        if (previewPdfDocRef.current?.doc) {
          try {
            previewPdfDocRef.current.doc.destroy();
          } catch {
            /* noop */
          }
          previewPdfDocRef.current = null;
        }
        const pdfjsLib = await getPdfjsLib();
        pdfDoc = await pdfjsLib.getDocument({ data: mergedPdfBytes.slice() }).promise;
        previewPdfDocRef.current = { bytes: mergedPdfBytes, doc: pdfDoc };
      }
      const pdfPage = await pdfDoc.getPage(pageIndex + 1);
      renderedPdfPage = pdfPage;

      const viewport = pdfPage.getViewport({ scale: 1.0 });
      const TARGET_DPI = 250;
      const dpiScale = TARGET_DPI / 72;
      const maxDim = Math.max(viewport.width, viewport.height);
      const isMobile = memoryManager.isMobileDevice();
      const dimCap = isMobile ? 1600 : 2400;
      const dimCapScale = dimCap / maxDim;
      const renderScale = Math.max(1.0, Math.min(4.0, Math.min(dpiScale, dimCapScale)));

      const scaledViewport = pdfPage.getViewport({ scale: renderScale });
      rawCanvas = memoryManager.acquireCanvas(
        Math.floor(scaledViewport.width),
        Math.floor(scaledViewport.height),
      );
      const rawCtx = rawCanvas.getContext('2d', { willReadFrequently: true })!;
      await pdfPage.render({ canvasContext: rawCtx, viewport: scaledViewport }).promise;
      originalImageData = rawCtx.getImageData(0, 0, rawCanvas.width, rawCanvas.height);

      // Release the render canvas immediately - we have the ImageData
      memoryManager.releaseCanvas(rawCanvas);
      rawCanvas = null;

      // Get or reuse the existing page profile
      const profile =
        pageProfiles[pageIndex] ?? (await engine.analyzePage(originalImageData, pageIndex));

      // Process through the engine
      const result = await engine.processPage(
        originalImageData,
        pageIndex,
        effectiveParams,
        profile,
      );
      optimizedImageData = result.optimizedImageData;

      // Release original ImageData (original is re-rendered lazily for before/after)
      originalImageData = null;

      // Generate thumbnail (small, memory-cheap)
      const tw = Math.max(1, Math.round(optimizedImageData.width / 4));
      const th = Math.max(1, Math.round(optimizedImageData.height / 4));
      thumbCanvas = memoryManager.acquireCanvas(tw, th);
      const thumbCtx = thumbCanvas.getContext('2d', { willReadFrequently: true });
      if (!thumbCtx) throw new Error('Could not initialize the preview thumbnail canvas.');

      tmpCanvas = memoryManager.acquireCanvas(
        optimizedImageData.width,
        optimizedImageData.height,
      );
      const tmpCtx = tmpCanvas.getContext('2d', { willReadFrequently: true });
      if (!tmpCtx) throw new Error('Could not initialize the full-size preview canvas.');
      tmpCtx.putImageData(optimizedImageData, 0, 0);
      thumbCtx.drawImage(tmpCanvas, 0, 0, tw, th);
      memoryManager.releaseCanvas(tmpCanvas);
      tmpCanvas = null;

      // Preserve the currently displayed preview until the replacement has
      // encoded AND its optimized pixels have been persisted successfully.
      const thumbBlob = await new Promise<Blob>((resolve, reject) => {
        thumbCanvas!.toBlob(
          (blob) => {
            if (blob && blob.size > 0) resolve(blob);
            else reject(new Error('Could not encode the processed-page thumbnail.'));
          },
          'image/jpeg',
          0.6,
        );
      });
      memoryManager.releaseCanvas(thumbCanvas);
      thumbCanvas = null;

      const thumbUrl = memoryManager.createTrackedBlobUrl(thumbBlob);
      pendingThumbUrl = thumbUrl;

      // Store optimized result in IndexedDB
      const optBlob = await memoryManager.imageDataToBlob(
        optimizedImageData,
        effectiveParams.outputQuality,
      );
      const previewPdfId = `pw_preview_${Date.now()}`;
      try {
        await pwOptimizerStorage.storePage(previewPdfId, pageIndex, null, optBlob);
      } catch (error) {
        // Never publish a ProcessedPage whose storage key does not exist; the
        // print exporter reads the final pixels from IndexedDB, not this RAM buffer.
        // Keep the last good preview alive; the pending URL is revoked in finally.
        console.warn('[PreviewReprocess] Failed to persist page preview:', error);
        throw new Error('Could not save preview page to browser storage.');
      }

      // Release optimized ImageData - no longer needed
      const optWidth = optimizedImageData.width;
      const optHeight = optimizedImageData.height;
      optimizedImageData = null;

      // Update ONLY the selected page in processedPages
      const updatedPage: ProcessedPage = {
        pageIndex,
        thumbnailDataUrl: thumbUrl,
        profile,
        parameters: effectiveParams,
        inkCoverageBeforePct: result.inkCoverageBeforePct,
        inkCoverageAfterPct: result.inkCoverageAfterPct,
        width: optWidth,
        height: optHeight,
        // Storage APIs take the document ID and page index separately.
        // Including the page suffix here would make getPage append it twice.
        storageKey: previewPdfId,
      };
      const previousPreviewUrl = previewBlobUrlRef.current;
      previewBlobUrlRef.current = thumbUrl;
      pendingThumbUrl = null;
      actions.updateSingleProcessedPage(pageIndex, updatedPage);
      if (previousPreviewUrl && previousPreviewUrl !== thumbUrl) {
        memoryManager.revokeBlobUrl(previousPreviewUrl);
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        console.error('[PreviewReprocess] Failed:', err);
        actions.setError(
          err instanceof Error && err.message === 'Could not save preview page to browser storage.'
            ? 'Could not save the preview page to browser storage. Free up space and try again.'
            : 'Preview processing failed. Try adjusting settings.',
        );
      }
    } finally {
      // Guaranteed cleanup - release any remaining resources
      if (rawCanvas) memoryManager.releaseCanvas(rawCanvas);
      if (thumbCanvas) memoryManager.releaseCanvas(thumbCanvas);
      if (tmpCanvas) memoryManager.releaseCanvas(tmpCanvas);
      if (pendingThumbUrl) memoryManager.revokeBlobUrl(pendingThumbUrl);
      try { renderedPdfPage?.cleanup(); } catch { /* PDF.js page may already be cleaned up */ }
      originalImageData = null;
      optimizedImageData = null;
      previewInFlightRef.current = false;
      actions.setPreviewProcessing(false);
    }
  }, [
    mergedPdfBytes,
    processedPages,
    selectedPageIndex,
    masterParams,
    processingToggles,
    pageProfiles,
    actions,
    previewBlobUrlRef,
    previewPdfDocRef,
  ]);

  /* ----------------------------------------------------------------
   * handleReprocess  -  BATCH RE-PROCESS ALL PAGES
   *
   * This is the ONLY action that applies current settings to
   * every page in the document. Triggered explicitly by the
   * "Re-process All Pages" button.
   * ---------------------------------------------------------------- */
  const handleReprocess = useCallback(async () => {
    if (!mergedPdfBytes) return;
    const startTime = Date.now();
    const abortController = new AbortController();
    abortRef.current = abortController;
    const pdfId = `pw_reprocess_${Date.now()}`;
    clearProgressiveThumbnails();

    // Keep the previous single-page preview alive while a full-document
    // reprocess is in flight; the old page list remains visible if it fails.
    await withProcessing(async () => {
      const signal = abortController.signal;
      const service = new OptimizationService();
      const effectiveParams = buildEffectiveParams(masterParams, processingToggles);
      const { processedPages: pages, docProfile: dProf } = await service.processDocument(
        mergedPdfBytes.buffer.slice(
          mergedPdfBytes.byteOffset,
          mergedPdfBytes.byteOffset + mergedPdfBytes.byteLength,
        ) as ArrayBuffer,
        pdfId,
        effectiveParams.preset,
        (curr, total, action) => {
          if (signal.aborted) throw new Error('CANCELLED');
          actions.setProgress({
            stage: 'OPTIMIZING',
            currentPage: curr,
            totalPages: total,
            percent: Math.round((curr / total) * 100),
            currentAction: action,
            elapsedMs: Date.now() - startTime,
          });
        },
        (pageIndex, thumbUrl) => {
          setProgressiveThumbnails(prev => {
            const next = new Map(prev);
            next.set(pageIndex, thumbUrl);
            return next;
          });
        },
        effectiveParams,
      );
      if (signal.aborted) return;
      actions.setTiming({
        analysisTimeMs: Math.round((Date.now() - startTime) * 0.15),
        optimizationTimeMs: Math.round((Date.now() - startTime) * 0.85),
      });
      actions.setDocProfile(dProf);
      actions.setPageProfiles(dProf.pages);
      actions.setProcessedPages(pages);
      if (previewBlobUrlRef.current) {
        const previousPreviewUrl = previewBlobUrlRef.current;
        previewBlobUrlRef.current = null;
        memoryManager.revokeBlobUrl(previousPreviewUrl);
      }
      actions.setExcludedPages(new Set());
    }, 'Re-processing failed. Try reducing settings values.', null);
    // Drop partial progressive URLs on both success and failure; successful
    // results are now available through ProcessedPage.thumbnailDataUrl.
    clearProgressiveThumbnails();
    if (abortRef.current === abortController) abortRef.current = null;
  }, [
    mergedPdfBytes,
    masterParams,
    processingToggles,
    actions,
    withProcessing,
    abortRef,
    previewBlobUrlRef,
    setProgressiveThumbnails,
    clearProgressiveThumbnails,
  ]);

  /**
   * Restores the selected preset defaults and turns OFF all manual
   * overrides. Does NOT automatically re-process pages.
   */
  const handleResetSettings = useCallback(() => {
    const presetDefaults = ParameterGenerator.getPresetParameters(masterParams.preset);
    actions.setMasterParams(presetDefaults);
    actions.setProcessingToggles({ ...DEFAULT_PROCESSING_TOGGLES });
  }, [masterParams.preset, actions]);

  return {
    handleProceedToPhase2,
    handlePreviewReprocess,
    handleReprocess,
    handleResetSettings,
  };
}
