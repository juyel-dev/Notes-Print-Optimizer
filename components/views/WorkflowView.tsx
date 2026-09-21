'use client';

import React, { useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  Download,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { WorkflowUIProps } from './types';
import { UploadArea } from '@/components/UploadArea';
import { FileNameField } from '@/components/ui/FileNameField';
import { FileSequencePanel } from '@/components/FileSequencePanel';
import { BeforeAfterSlider } from '@/components/BeforeAfterSlider';
import { PageGrid } from '@/components/PageGrid';
import { PageSequencePreview } from '@/components/PageSequencePreview';
import { WhiteBoxEditor } from '@/components/whitebox/WhiteBoxEditor';
import { Button } from '@/components/ui/Button';
import { PhaseErrorBoundary } from '@/components/shared/PhaseErrorBoundary';
import { CardSkeleton } from '@/components/shared/LoadingSkeleton';
import { EmptyPhaseState } from '@/components/shared/EmptyPhaseState';
import { buildExcludedSet } from '@/lib/workflow/phaseUtils';
import { PrintLayoutStep } from '@/components/layout/PrintLayoutStep';
import { LayoutService } from '@/lib/services/LayoutService';
import { ExportService } from '@/lib/services/ExportService';
import type { NupOptions } from '@/lib/nup/nupLayout';
import type { BuildResult } from '@/lib/nup/nupService';

const FeedbackSection = dynamic(() => import('@/components/FeedbackSection').then(m => m.FeedbackSection), {
  loading: () => <CardSkeleton />,
});

const ProcessingSettingsPanel = dynamic(() => import('@/components/ProcessingSettingsPanel').then(m => m.ProcessingSettingsPanel), {
  loading: () => <CardSkeleton />,
});

/**
 * One workflow view for every screen size. Density and structure differences
 * are pure CSS breakpoints — no JS media queries, no platform forks.
 *
 * Action bars are thumb-reachable fixed rows below md, inline rows from md up:
 * same DOM node, different positioning classes only.
 */
const ActionBar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 border-t border-surface-2 bg-surface/95 p-3 pb-safe shadow-2xl backdrop-blur-md md:static md:border-0 md:bg-transparent md:p-0 md:pt-3 md:shadow-none md:backdrop-blur-none">
    {children}
  </div>
);

export const WorkflowView: React.FC<WorkflowUIProps> = ({ state, actions, handlers, onToolModeChange, enhanceHandoffActive, onBackToEnhance }) => {
  const {
    currentPhase,
    isProcessing,
    uploadedItems,
    mergedPdfBlob,
    mergedPdfBytes,
    mergedPageDataUrls,
    processedPages,
    selectedPageIndex,
    excludedPages,
    keepOriginalPages,
    manualWhiteBoxRegions,
    masterParams,
    processingToggles,
    isPreviewProcessing,
    analysisTimeMs,
    optimizationTimeMs,
  } = state;

  const {
    setPhase: setCurrentPhase,
    setSelectedPageIndex,
    setMasterParams: onMasterParamsChange,
    setProcessingToggles: onProcessingTogglesChange,
    setExcludedPages,
  } = actions;

  const {
    handleFilesUpload: onFilesUpload,
    handleMoveItem: onMoveItem,
    handleRemoveItem: onRemoveItem,
    handleReorderItem: onReorderItem,
    handleSmartArrange: onSmartArrange,
    handleDownloadMerged: onDownloadMerged,
    handleProceedToPhase2: onProceedToPhase2,
    handleToggleExcludePage: onToggleExcludePage,
    handleToggleKeepOriginalPage: onToggleKeepOriginalPage,
    handleSetManualRegions: onSetManualRegions,
    handleClearManualRegions: onClearManualRegions,
    handleProceedToPhase3: onProceedToPhase3,
    handleReprocess: onReprocess,
    handlePreviewReprocess: onPreviewReprocess,
    handleResetSettings: onResetSettings,
    handleProceedToPhase4: onProceedToPhase4,
    handleResetWorkflow: onResetWorkflow,
  } = handlers;

  const onToggleExcludeAll = (exclude: boolean) => {
    setExcludedPages(buildExcludedSet(state.processedPages.length, exclude));
  };

  // Output name for the final print PDF, shared by phase 3 and phase 4 downloads.
  const [printBase, setPrintBase] = useState(() =>
    uploadedItems[0]?.name ? uploadedItems[0].name.replace(/\.pdf$/i, '') : 'Print_Ready_Notes',
  );

  // --- Phase 3 (Layout) local state ------------------------------------
  // Deliberately NOT in the shared workflowReducer. Phase 3's entire input
  // is flattenedLayoutInput (bytes produced from Phase 1/2's finalized
  // active pages, computed once when entering Phase 3 — see
  // handleProceedToLayout below); its entire output is layoutResult. No
  // other phase reads or writes either piece, so Phase 3 (this component's
  // use of PrintLayoutStep) can be modified/replaced independently of
  // Phase 1/2, and vice versa — see PrintLayoutStep.tsx's own doc comment.
  const [flattenedLayoutInput, setFlattenedLayoutInput] = useState<{ bytes: Uint8Array; pageCount: number } | null>(null);
  const [flattenError, setFlattenError] = useState<string | null>(null);
  const [layoutResult, setLayoutResult] = useState<{ result: BuildResult; opts: NupOptions } | null>(null);

  const handleProceedToLayout = useCallback(async () => {
    setFlattenError(null);
    setFlattenedLayoutInput(null);
    onProceedToPhase3();
    try {
      const activePages = LayoutService.getActivePages(processedPages, excludedPages);
      if (activePages.length === 0) {
        setFlattenError('All pages are excluded — include at least one page to continue.');
        return;
      }
      const { PdfExporter } = await import('@/lib/optimizer/pdfExporter');
      const { bytes, pageCount } = await PdfExporter.flattenActivePagesToPdf(activePages, {
        keepOriginalPages,
        manualWhiteBoxRegions,
        mergedPdfBytes,
      });
      setFlattenedLayoutInput({ bytes, pageCount });
    } catch (e: unknown) {
      setFlattenError(e instanceof Error ? e.message : 'Failed to prepare pages for layout.');
    }
  }, [onProceedToPhase3, processedPages, excludedPages, keepOriginalPages, manualWhiteBoxRegions, mergedPdfBytes]);

  const handleLayoutGenerated = useCallback((result: BuildResult, opts: NupOptions) => {
    setLayoutResult({ result, opts });
    onProceedToPhase4();
  }, [onProceedToPhase4]);

  const handleDownloadLayoutResult = useCallback(() => {
    if (!layoutResult) return;
    const clean = printBase.trim() || 'Print_Ready_Notes';
    ExportService.downloadBlob(layoutResult.result.blob, `${clean}-PrintReady.pdf`);
  }, [layoutResult, printBase]);

  // Ink-saved % — a real metric, computed independently of the old grid
  // engine (LayoutEngine/compileSheetsAndExportPdf), directly from
  // processedPages' own before/after ink-coverage data. Same formula the
  // old engine used internally; kept because it's genuinely useful,
  // user-facing information, not decoration.
  const inkSavedPct = useMemo(() => {
    const activePages = LayoutService.getActivePages(processedPages, excludedPages);
    if (activePages.length === 0) return null;
    const avgBefore = activePages.reduce((s, p) => s + p.inkCoverageBeforePct, 0) / activePages.length;
    const avgAfter = activePages.reduce(
      (s, p) => s + (keepOriginalPages.has(p.pageIndex) ? p.inkCoverageBeforePct : p.inkCoverageAfterPct),
      0,
    ) / activePages.length;
    if (avgBefore <= 0) return null;
    return Math.max(0, Math.round(((avgBefore - avgAfter) / avgBefore) * 100));
  }, [processedPages, excludedPages, keepOriginalPages]);

  // Manual region editor — which page is being edited (null = closed)
  const [editingPageIdx, setEditingPageIdx] = useState<number | null>(null);
  const editingPage = editingPageIdx !== null ? processedPages.find((p) => p.pageIndex === editingPageIdx) ?? null : null;
  const handleEditPage = useCallback((idx: number) => setEditingPageIdx(idx), []);
  const handleEditorApply = useCallback((regions: import('@/lib/kernels/whiteBox').WhiteBoxRegion[]) => {
    if (editingPage) {
      onSetManualRegions(editingPage.pageIndex, regions);
    }
    setEditingPageIdx(null);
  }, [editingPage, onSetManualRegions]);

  const stepLabel =
    currentPhase === 1 ? '1 · Upload' : currentPhase === 2 ? '2 · Whiten' : currentPhase === 3 ? '3 · Layout' : '4 · Done';

  return (
    <div className="flex w-full max-w-full min-w-0 flex-col gap-4 md:gap-5 lg:gap-6">
      <header className="sticky top-0 z-30 -mx-4 flex items-center gap-3 border-b border-surface-2/70 bg-bg/90 px-4 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={() => {
            handlers.handleResetWorkflow();
            onToolModeChange?.(null);
          }}
          aria-label="Back to tools"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-elevated/60 bg-surface/80 text-ink transition-transform duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate text-[15px] font-bold text-ink">Dark Notes → Print</h1>
          <p className="truncate text-[11px] text-ink-faint">Auto-whiten · N-up · Print-ready · 100% on-device</p>
        </div>
        <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-bold tabular-nums text-accent-soft">
          {stepLabel}
        </span>
      </header>

      {/* PHASE 1: UPLOAD & MERGE */}
      {currentPhase === 1 && (
        <PhaseErrorBoundary phaseName="Upload & Merge">
          <div className="animate-enter flex flex-col gap-4 md:gap-5">

            <div id="upload-area" className="scroll-mt-4">
              <UploadArea onFilesUpload={onFilesUpload} isProcessing={isProcessing} />
            </div>

            {uploadedItems.length > 0 && (
              <>
                <section className="flex flex-col gap-3 rounded-2xl border border-surface-2 bg-surface/90 p-3.5 shadow-lg sm:p-4 lg:p-5 sm:gap-4 sm:shadow-xl">
                  <div className="border-b border-surface-2 pb-2 sm:pb-3">
                    <h3 className="text-xs font-bold text-ink sm:text-sm">
                      PDF Sequence ({uploadedItems.length})
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      Arrange files in lecture order before processing.
                    </p>
                  </div>

                  {/* Smart rearrangement: series-aware auto sort + drag & drop */}
                  <FileSequencePanel
                    items={uploadedItems}
                    isProcessing={isProcessing}
                    onMoveItem={onMoveItem}
                    onRemoveItem={onRemoveItem}
                    onReorderItem={onReorderItem}
                    onSmartArrange={onSmartArrange}
                    maxHeightClass="max-h-[320px]"
                  />

                  <PageSequencePreview pageUrls={mergedPageDataUrls} />
                </section>

                <ActionBar>
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={onDownloadMerged}
                    disabled={!mergedPdfBlob}
                    aria-label="Download merged PDF"
                  >
                    <Download className="h-4 w-4 text-ink-muted" />
                    <span className="hidden lg:inline">Download Merged PDF</span>
                  </Button>

                  <Button
                    variant="primary"
                    size="lg"
                    onClick={onProceedToPhase2}
                    disabled={!mergedPdfBytes || isProcessing}
                    className="flex-1 md:flex-none"
                  >
                    Whiten PDF
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </ActionBar>
              </>
            )}
          </div>
        </PhaseErrorBoundary>
      )}

      {/* PHASE 2: ANALYZE & OPTIMIZE */}
      {currentPhase === 2 &&
        (processedPages.length > 0 ? (
          <PhaseErrorBoundary phaseName="Analyze & Optimize">
            <div className="animate-enter flex flex-col gap-4 md:gap-5">
              <div className="flex items-center gap-3 rounded-2xl border border-success-strong/30 bg-success-faint/40 p-3.5 shadow-lg sm:p-4 sm:shadow-xl">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success-deep text-bg font-bold shadow-md sm:h-11 sm:w-11">
                  <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-success-soft">Dark Backgrounds Stripped</h3>
                  <p className="truncate text-xs text-ink-muted">
                    Processed {processedPages.length} pages · ~82% ink savings.
                  </p>
                </div>
              </div>

              {/* Processing settings (collapsed by default) */}
              <ProcessingSettingsPanel
                params={masterParams}
                onParamsChange={onMasterParamsChange}
                onReprocess={onReprocess}
                isProcessing={isProcessing}
                toggles={processingToggles}
                onTogglesChange={onProcessingTogglesChange}
                onPreviewReprocess={onPreviewReprocess}
                isPreviewProcessing={isPreviewProcessing}
                onResetSettings={onResetSettings}
              />

              {processedPages[selectedPageIndex] && (
                <BeforeAfterSlider page={processedPages[selectedPageIndex]} mergedPdfBytes={mergedPdfBytes} />
              )}

              <PageGrid
                pages={processedPages}
                selectedPageIndex={selectedPageIndex}
                onSelectPage={setSelectedPageIndex}
                excludedPages={excludedPages}
                onToggleExcludePage={onToggleExcludePage}
                onToggleExcludeAll={onToggleExcludeAll}
                keepOriginalPages={keepOriginalPages}
                onToggleKeepOriginalPage={onToggleKeepOriginalPage}
                manualWhiteBoxRegions={manualWhiteBoxRegions}
                onEditPage={handleEditPage}
                mergedPdfBytes={mergedPdfBytes}
              />
              {editingPage && (
                <WhiteBoxEditor
                  key={editingPage.pageIndex}
                  page={editingPage}
                  autoRegions={editingPage.whiteBoxRegions ?? []}
                  manualRegions={manualWhiteBoxRegions[editingPage.pageIndex] ?? []}
                  onApply={handleEditorApply}
                  onClose={() => setEditingPageIdx(null)}
                />
              )}

              <ActionBar>
                <Button variant="secondary" size="md" onClick={() => setCurrentPhase(1)}>
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>

                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleProceedToLayout}
                  disabled={isProcessing}
                  className="flex-1 md:flex-none"
                >
                  Choose Layout
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </ActionBar>
            </div>
          </PhaseErrorBoundary>
        ) : (
          <EmptyPhaseState
            title="No pages to whiten yet"
            message="Upload and process your PDF first — then you can fine-tune ink savings here."
            onBack={() => setCurrentPhase(1)}
            backLabel="Back to Upload"
          />
        ))}

      {/* PHASE 3: LAYOUT & GENERATE — self-contained N-up step. Its entire
          input is flattenedLayoutInput (produced above the moment Phase 2's
          active pages are finalized); it has no knowledge of
          excludedPages/keepOriginalPages/manualWhiteBoxRegions/mergedPdfBytes
          or any other Phase 1/2 internals, and Phase 1/2 have no knowledge
          of its N-up config shape either — see PrintLayoutStep.tsx. */}
      {currentPhase === 3 &&
        (processedPages.length > 0 ? (
          <PhaseErrorBoundary phaseName="Layout & Generate">
            <div className="animate-enter flex flex-col gap-4 md:gap-5">
              {flattenError ? (
                <EmptyPhaseState
                  title="Couldn't prepare pages for layout"
                  message={flattenError}
                  onBack={() => setCurrentPhase(2)}
                  backLabel="Back to Whiten"
                />
              ) : (
                <PrintLayoutStep
                  flattenedPdfBytes={flattenedLayoutInput?.bytes ?? null}
                  totalPages={flattenedLayoutInput?.pageCount ?? 0}
                  onGenerated={handleLayoutGenerated}
                  onBack={enhanceHandoffActive && onBackToEnhance ? onBackToEnhance : () => setCurrentPhase(2)}
                  backLabel={enhanceHandoffActive && onBackToEnhance ? 'Back to Enhance' : 'Back to Whiten'}
                />
              )}
            </div>
          </PhaseErrorBoundary>
        ) : (
          <EmptyPhaseState
            title="Nothing to lay out yet"
            message="Optimize your PDF first so we can arrange the pages onto print sheets."
            onBack={() => setCurrentPhase(1)}
            backLabel="Back to Upload"
          />
        ))}

      {/* PHASE 4: DONE */}
      {currentPhase === 4 &&
        (layoutResult ? (
          <PhaseErrorBoundary phaseName="Complete">
            <div className="animate-enter mx-auto flex max-w-xl flex-col items-center gap-5 text-center">
              <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-success-strong/30 bg-surface/90 p-6 shadow-lg sm:p-8 sm:shadow-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/illustrations/order-delivered.svg" alt="" aria-hidden="true" className="h-32 sm:h-40 w-auto max-w-[260px] object-contain" loading="lazy" />
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-success-strong/30 bg-success-strong/20 text-success sm:h-16 sm:w-16">
                  <CheckCircle2 className="h-8 w-8 sm:h-10 sm:w-10" />
                </div>

                <h2 className="mt-1 text-xl font-bold text-ink sm:text-display">Your PDF is Print-Ready!</h2>
                <p className="max-w-md text-xs leading-relaxed text-ink-muted sm:text-sm">
                  Your notes have been stripped of dark backgrounds, sharpened, and formatted for paper-saving printouts.
                </p>

                {inkSavedPct !== null && (
                  <div className="mt-2 flex items-center gap-2 text-xs font-bold">
                    <span className="rounded-lg border border-primary/30 bg-primary/20 px-3 py-1 text-primary-soft">
                      Ink Saved: ~{inkSavedPct}%
                    </span>
                  </div>
                )}

                <div className="mt-1 w-full max-w-xs">
                  <FileNameField
                    baseName={printBase}
                    onChange={setPrintBase}
                    suffix="-PrintReady.pdf"
                    label="Print PDF filename"
                  />
                </div>

                <Button variant="secondary" size="md" onClick={handleDownloadLayoutResult}>
                  <Download className="h-4 w-4" />
                  Download Print PDF Again
                </Button>
              </div>

              <FeedbackSection
                currentPhase={4}
                uploadedItemsCount={uploadedItems.length}
                uploadedFileNames={uploadedItems.map((item) => item.name)}
                uploadedFileSizesMB={uploadedItems.map((item) => (item.file?.size || 0) / (1024 * 1024))}
                mergedPdfSizeMB={(mergedPdfBlob?.size || 0) / (1024 * 1024)}
                totalInputPages={processedPages.length || mergedPageDataUrls.length}
                totalOutputPages={layoutResult.result.sheets}
                excludedPagesCount={excludedPages.size}
                totalOriginalSizeMB={
                  uploadedItems.reduce((acc, item) => acc + (item.file?.size || 0), 0) / (1024 * 1024)
                }
                finalMetrics={{
                  totalOptimizedSizeMB: layoutResult.result.blob.size / (1024 * 1024),
                  inkSavedPct: inkSavedPct ?? 0,
                  processingTimeMs: layoutResult.result.ms,
                }}
                layoutConfig={{
                  gridFormat: layoutResult.opts.format,
                  paperSize: layoutResult.opts.paper,
                  orientation: layoutResult.opts.orientation,
                  showSlideBorders: layoutResult.opts.borders,
                  showPageNumbers: layoutResult.opts.numbers,
                }}
                finalPrintPdfBlob={layoutResult.result.blob}
                analysisTimeMs={analysisTimeMs}
                optimizationTimeMs={optimizationTimeMs}
                layoutTimeMs={layoutResult.result.ms}
              />

              <Button variant="secondary" size="md" onClick={onResetWorkflow}>
                <RotateCcw className="h-4 w-4" />
                Optimize Another PDF
              </Button>
            </div>
          </PhaseErrorBoundary>
        ) : (
          <EmptyPhaseState
            title="Nothing here yet"
            message="Generate your print-ready PDF first — your summary and feedback form will appear here."
            onBack={() => setCurrentPhase(3)}
            backLabel="Back to Layout"
          />
        ))}
    </div>
  );
};