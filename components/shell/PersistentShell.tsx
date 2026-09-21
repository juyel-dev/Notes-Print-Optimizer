'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { ProcessingModal } from '@/components/ProcessingModal';
import { PlatformUIOrchestrator } from '@/components/views/PlatformUIOrchestrator';
import { CommandPalette } from '@/components/CommandPalette';
import { usePageHandlers } from '@/lib/workflow/usePageHandlers';
import { useMonitor } from '@/lib/monitoring/useMonitor';
import { ToastProvider } from '@/components/shared/Toast';
import { SeoVisibilityContext } from '@/components/seo/SeoVisibilityContext';
import { modeForSlug, toolHref } from '@/lib/tools/registry';
import { recordToolVisit } from '@/lib/services/RecentToolsService';
import type { ToolMode } from '@/lib/enhance/types';
import type { WorkflowState, WorkflowActions, WorkflowHandlers } from '@/components/views/types';
import type { HandoffPageInput } from '@/lib/services/EnhanceHandoffService';
import { RefreshCw, X } from 'lucide-react';

/**
 * Persistent client shell — mounted ONCE by app/(app)/layout.tsx and kept
 * alive across every soft route change inside the group. Owns:
 *
 *  - session/workflow state (usePageHandlers) that must survive navigation
 *  - the Enhance→N-Up handoff flag (in-memory by design)
 *  - SW registration + update banner
 *  - header/footer chrome
 *
 * The ACTIVE TOOL is derived from the URL via usePathname(): the URL is the
 * single source of truth. Deep links, refresh, back and forward all resolve
 * to the same tool without any imperative history plumbing.
 *
 * Server pages inject crawlable content as `children`; it renders below the
 * interactive tool stage so UX is unchanged while SEO HTML ships statically.
 */
export function PersistentShell({ children }: { children: React.ReactNode }) {
  useMonitor();
  const router = useRouter();
  const pathname = usePathname();
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);
  /** True while the user is inside the N-Up stage reached from the enhance tool. */
  const [arrivedViaEnhance, setArrivedViaEnhance] = useState(false);

  // URL → tool mode. `/tools/<slug>/…` maps through the registry contract;
  // anything else (home) is the landing.
  const toolMode: ToolMode | null = useMemo(() => {
    if (!pathname) return null;
    const match = pathname.match(/^\/tools\/([^/]+)/);
    return match ? modeForSlug(match[1]) : null;
  }, [pathname]);

  // Track visits for the "Continue where you left off" chip on the landing
  // page — a visit, not a completion, so it's a proxy for interest, not
  // proof the tool was actually used successfully.
  useEffect(() => {
    if (toolMode) recordToolVisit(toolMode);
  }, [toolMode]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
      const swPath = `${basePath}/sw.js`;
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register(swPath, { scope: `${basePath}/`, updateViaCache: 'none' })
          .then((reg) => {
            reg.addEventListener('updatefound', () => {
              const nw = reg.installing;
              if (nw) {
                nw.addEventListener('statechange', () => {
                  if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                    setSwUpdateAvailable(true);
                  }
                });
              }
            });
          })
          .catch((err) => console.warn('[SW] Registration failed:', err));
      });
    }
  }, []);

  /** URL navigation IS tool selection — native router, history-aware. */
  const navigateToTool = useCallback(
    (mode: ToolMode | null) => {
      router.push(mode ? toolHref(mode) : '/');
    },
    [router],
  );

  const {
    state, actions,
    handleResetWorkflow, handleFilesUpload,
    handleMoveItem, handleRemoveItem, handleDownloadMerged,
    handleSmartArrange, handleReorderItem,
    handleProceedToPhase2, handleToggleExcludePage, handleDownloadOptimized1Up,
    handleToggleKeepOriginalPage, handleSetManualRegions, handleClearManualRegions,
    handleProceedToPhase3, handleReprocess, handlePreviewReprocess,
    handleResetSettings,
    handleSelectLayoutFormat, handleToggleOrientation, handleToggleBorders,
    handleTogglePageNumbers, handleUpdateOuterMargins, handleUpdateInnerMargin,
    handleApplyLayout, handleDownloadFinalPrintPdf, handleProceedToPhase4,
    handleSendFeedback, compilePhase3PrintLayout,
    handleCancelProcessing,
    handleEnhanceLayoutHandoff,
    progressiveThumbnails,
  } = usePageHandlers();

  /** Enhance -> N-Up: land inside the dark-print tool via its route, without
   * its pipeline chrome (stepper/back-to-optimize) — see arrivedViaEnhance. */
  const runEnhanceLayoutHandoff = useCallback(async (pages: HandoffPageInput[]) => {
    await handleEnhanceLayoutHandoff(pages);
    setArrivedViaEnhance(true);
    router.push(toolHref('dark-print'));
  }, [handleEnhanceLayoutHandoff, router]);

  /** From the handoff stage, reset exits to the tools box, not tool-1 upload. */
  const handleSessionReset = useCallback(() => {
    if (arrivedViaEnhance) {
      setArrivedViaEnhance(false);
      router.push('/');
    }
    handleResetWorkflow();
  }, [arrivedViaEnhance, handleResetWorkflow, router]);

  /** Return to the enhance workbench (its results stay alive in the tool machine). */
  const handleBackToEnhance = useCallback(() => {
    setArrivedViaEnhance(false);
    router.push(toolHref('enhance'));
    handleResetWorkflow();
  }, [handleResetWorkflow, router]);

  // SEO blocks (About / FAQ / Related) — premium: visible only on upload
  // + done. Dark-print is derived synchronously (phase 1 + 4); every other
  // tool drives visibility via SeoVisibilityContext from inside its own step.
  const [seoVisibleOther, setSeoVisibleOther] = useState(true);
  const seoVisible =
    toolMode === 'dark-print' ? state.currentPhase === 1 || state.currentPhase === 4 : seoVisibleOther;

  useEffect(() => {
    if (toolMode !== 'dark-print' && toolMode !== null) setSeoVisibleOther(true);
  }, [toolMode]);

  const workflowState: WorkflowState = useMemo(() => ({
    currentPhase: state.currentPhase,
    isProcessing: state.isProcessing,
    progress: state.progress,
    errorMessage: state.errorMessage,
    uploadedItems: state.uploadedItems,
    mergedPdfBlob: state.mergedPdfBlob,
    mergedPdfBytes: state.mergedPdfBytes,
    mergedPageDataUrls: state.mergedPageDataUrls,
    processedPages: state.processedPages,
    selectedPageIndex: state.selectedPageIndex,
    excludedPages: state.excludedPages,
    keepOriginalPages: state.keepOriginalPages,
    manualWhiteBoxRegions: state.manualWhiteBoxRegions,
    docProfile: state.docProfile,
    masterParams: state.masterParams,
    processingToggles: state.processingToggles,
    isPreviewProcessing: state.isPreviewProcessing,
    layoutConfig: state.layoutConfig,
    layoutDirty: state.layoutDirty,
    finalSheetPreviews: state.finalSheetPreviews,
    finalMetrics: state.finalMetrics,
    finalPrintPdfBlob: state.finalPrintPdfBlob,
    analysisTimeMs: state.analysisTimeMs,
    optimizationTimeMs: state.optimizationTimeMs,
    layoutTimeMs: state.layoutTimeMs,
    rating: state.rating,
    feedbackText: state.feedbackText,
    feedbackSubmitted: state.feedbackSubmitted,
    progressiveThumbnails,
  }), [state, progressiveThumbnails]);

  const workflowActions: WorkflowActions = useMemo(() => ({
    setPhase: actions.setPhase,
    setError: actions.setError,
    setSelectedPageIndex: actions.setSelectedPageIndex,
    setMasterParams: actions.setMasterParams,
    setProcessingToggles: actions.setProcessingToggles,
    setExcludedPages: actions.setExcludedPages,
    setRating: actions.setRating,
    setFeedbackText: actions.setFeedbackText,
  }), [actions]);

  const workflowHandlers: WorkflowHandlers = useMemo(() => ({
    handleFilesUpload,
    handleMoveItem,
    handleRemoveItem,
    handleReorderItem,
    handleSmartArrange,
    handleDownloadMerged,
    handleProceedToPhase2,
    handleToggleExcludePage,
    handleToggleKeepOriginalPage,
    handleSetManualRegions,
    handleClearManualRegions,
    handleDownloadOptimized1Up,
    handleProceedToPhase3,
    handleReprocess,
    handlePreviewReprocess,
    handleResetSettings,
    handleApplyLayout,
    handleSelectLayoutFormat,
    handleToggleOrientation,
    handleToggleBorders,
    handleTogglePageNumbers,
    handleUpdateOuterMargins,
    handleUpdateInnerMargin,
    handleDownloadFinalPrintPdf,
    handleProceedToPhase4,
    handleSendFeedback,
    compilePhase3PrintLayout,
    handleCancelProcessing,
    handleResetWorkflow: handleSessionReset,
  }), [
    handleFilesUpload, handleMoveItem, handleRemoveItem,
    handleReorderItem, handleSmartArrange, handleDownloadMerged, handleProceedToPhase2,
    handleToggleExcludePage, handleDownloadOptimized1Up, handleProceedToPhase3,
    handleReprocess, handlePreviewReprocess, handleResetSettings, handleApplyLayout,
    handleSelectLayoutFormat, handleToggleOrientation, handleToggleBorders,
    handleTogglePageNumbers, handleUpdateOuterMargins, handleUpdateInnerMargin,
    handleDownloadFinalPrintPdf, handleProceedToPhase4, handleSendFeedback,
    handleCancelProcessing, compilePhase3PrintLayout,
    handleSessionReset,
  ]);

  return (
    <ToastProvider>
      <SeoVisibilityContext.Provider value={{ visible: seoVisible, setVisible: setSeoVisibleOther }}>
        <CommandPalette />
        <div className="min-h-screen bg-bg app-shell-bg text-ink font-sans flex flex-col pb-safe">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Header
        currentPhase={state.currentPhase}
        onReset={handleSessionReset}
        onNavigatePhase={(phase) => actions.setPhase(phase)}
        isProcessing={state.isProcessing}
        showStepper={toolMode === 'dark-print' && !arrivedViaEnhance}
      />
      <ProcessingModal progress={state.progress} onCancel={handleCancelProcessing} progressiveThumbnails={progressiveThumbnails} />
      {swUpdateAvailable && (
        <div role="status" className="bg-primary-faint/90 border-b border-primary-deep text-primary-soft text-xs py-2 px-4 flex items-center justify-between font-medium shadow-md">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 text-primary-soft animate-spin" />
            <span>A new version of Print Optimizer is available.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="bg-primary-strong hover:bg-primary text-white px-2.5 py-1 rounded text-xs font-semibold transition"
            >
              Update Now
            </button>
            <button
              onClick={() => setSwUpdateAvailable(false)}
              className="p-2 hover:text-ink text-primary-soft transition"
              aria-label="Dismiss update alert"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      {state.errorMessage && (
        <div role="alert" className="bg-danger-faint/90 border-b border-danger-deep text-danger-soft text-xs py-2.5 px-4 flex items-center justify-between font-medium shadow-md">
          <div className="flex-1 text-center">{state.errorMessage}</div>
          <button
            onClick={() => actions.setError(null)}
            className="p-2 hover:text-ink text-danger-soft transition"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {/* pb-28 only while a tool is active — it reserves room for the fixed action bar.
          Landing has no bar, so the dead 112px gap before the footer is removed. */}
      <main id="main-content" className={`mx-auto w-full max-w-5xl lg:max-w-6xl flex-1 px-3 py-4 sm:px-6 sm:py-6 ${toolMode !== null ? 'pb-28 md:pb-8' : 'pb-10 md:pb-8'}`}>
        {toolMode !== null && (
          <>
            <PlatformUIOrchestrator
              state={workflowState}
              actions={workflowActions}
              handlers={workflowHandlers}
              toolMode={toolMode}
              onToolModeChange={navigateToTool}
              onEnhanceHandoff={runEnhanceLayoutHandoff}
              enhanceHandoffActive={arrivedViaEnhance}
              onBackToEnhance={handleBackToEnhance}
            />
            <div className="mt-6 md:mt-8" />
          </>
        )}
        {children}
      </main>
      <footer className="mt-12 px-3 pb-5 sm:px-4">
        <div className="mx-auto max-w-6xl border-t border-elevated/70 pt-6 sm:pt-7">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#3654D9] via-[#5B7FFF] to-[#F2A93C] text-white shadow-md shadow-[#5B7FFF]/15">
                  <span className="text-sm font-black">P</span>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold tracking-tight text-ink">Print Optimizer</div>
                  <div className="text-[11px] font-semibold text-ink-muted">Made for students · 100% offline</div>
                </div>
              </div>
              <p className="mt-3 max-w-md text-xs leading-relaxed text-ink-muted">
                Whiten, enhance, convert, merge and arrange student notes without sending your documents to a server.
              </p>
            </div>

            <nav aria-label="Footer navigation" className="grid grid-cols-2 gap-x-7 gap-y-2 text-xs font-semibold text-ink-muted sm:grid-cols-3 sm:text-right">
              <Link href="/tools/dark-print/" className="transition-colors hover:text-primary-soft">Dark Notes → Print</Link>
              <Link href="/tools/n-up/" className="transition-colors hover:text-primary-soft">N-up PDF</Link>
              <Link href="/tools/merge-pdf/" className="transition-colors hover:text-primary-soft">Merge PDF</Link>
              <Link href="/tools/image-to-pdf/" className="transition-colors hover:text-primary-soft">Image → PDF</Link>
              <a href="https://github.com/juyel-dev/Notes-Print-Optimizer" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-primary-soft">GitHub</a>
              <a href="https://t.me/PrintOptimizer_chat" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-primary-soft">Discussions</a>
              <a href="mailto:myself.juyel.dev@gmail.com" className="transition-colors hover:text-primary-soft">Contact</a>
              <button
                type="button"
                onClick={() => {
                  const btn = document.querySelector<HTMLButtonElement>('[aria-label="Toggle App Menu"]');
                  btn?.click();
                  setTimeout(() => {
                    const legalHeader = document.getElementById('menu-header-legal');
                    legalHeader?.click();
                    legalHeader?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 300);
                }}
                className="text-left transition-colors hover:text-primary-soft"
              >
                Legal
              </button>
            </nav>
          </div>

          <div className="mt-6 flex flex-col gap-1 border-t border-elevated/50 pt-4 text-[11px] text-ink-faint sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 Juyel Hossain · JSL v1.0</p>
            <p>Print Optimizer · Student Notes Suite · v37</p>
          </div>
        </div>
      </footer>
        </div>
      </SeoVisibilityContext.Provider>
    </ToastProvider>
  );
}
