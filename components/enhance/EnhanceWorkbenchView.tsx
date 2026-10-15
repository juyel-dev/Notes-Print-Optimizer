'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, Ban, Check, ChevronDown, Columns2, Download, LayoutGrid, Loader2, RotateCcw, Share2, Wand2, ZoomIn, ZoomOut } from 'lucide-react';
import {
  DEFAULT_ENHANCE_SETTINGS,
  ENHANCE_DETAIL_DPI,
  ENHANCE_DETAIL_LABEL,
  ENHANCE_PRESETS,
  ENHANCE_SETTING_RANGE,
  matchPreset,
  sameTone,
  type EnhanceDetail,
  type EnhanceSettings,
} from '@/lib/enhance/types';
import { renderEnhancedPreview } from '@/lib/enhance/livePreview';
import type { EnhanceWorkflow } from '@/lib/enhance/useEnhanceWorkflow';
import { Button } from '@/components/ui/Button';
import { SliderRow } from '@/components/ui/Slider';
import { ToggleRow } from '@/components/ui/Toggle';
import { FileNameField } from '@/components/ui/FileNameField';

export interface EnhanceWorkbenchViewProps {
  workflow: EnhanceWorkflow;
  /** Bridges the enhanced pages into the main pipeline's N-Up layout. */
  onChooseLayout?: () => void;
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft';
const DETAILS: EnhanceDetail[] = ['standard', 'high', 'ultra'];

function defaultBaseName(fileName: string): string {
  const base = fileName.replace(/(-enhanced|-PrintReady)?\.pdf$/i, '');
  return !base || base === 'enhanced-print' ? 'Enhanced' : base;
}

export const EnhanceWorkbenchView: React.FC<EnhanceWorkbenchViewProps> = ({ workflow, onChooseLayout }) => {
  const {
    state,
    handleSetSettings,
    handleSetSelected,
    handleApplySettings,
    handleCancelProcessing,
    handleDownloadPrintPdf,
    handleSharePdf,
    handleReset,
    handleBackToArrange,
  } = workflow;
  const [showBefore, setShowBefore] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [tuneOpen, setTuneOpen] = useState(false);
  const [live, setLive] = useState<string | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [outBase, setOutBase] = useState(() => defaultBaseName(state.fileName));
  const selected = state.results[state.selectedIndex];
  const applied = state.appliedSettings;

  const hasResults = state.results.length > 0;
  const toneDirty = hasResults && !!applied && !sameTone(applied, state.settings);
  const detailDirty = hasResults && !!applied && applied.detail !== state.settings.detail;
  const isDirty = !hasResults || !applied || toneDirty || detailDirty;
  const activePreset = matchPreset(state.settings);

  // Live preview: re-enhance just the selected page (from its in-memory original) while sliders move.
  const toneKey = `${state.settings.darken}|${state.settings.contrast}|${state.settings.sharpen}|${state.settings.cleanBackground}|${state.settings.grayscale}|${state.settings.evenLighting}`;
  const originalUrl = selected?.originalDataUrl;
  useEffect(() => {
    if (!originalUrl || !toneDirty || state.isProcessing) {
      setLive(null);
      setLiveBusy(false);
      return;
    }
    let cancelled = false;
    setLiveBusy(true);
    const t = window.setTimeout(async () => {
      try {
        const url = await renderEnhancedPreview(originalUrl, state.settings);
        if (!cancelled) setLive(url);
      } catch {
        if (!cancelled) setLive(null);
      } finally {
        if (!cancelled) setLiveBusy(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // state.settings is captured through toneKey on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalUrl, toneKey, toneDirty, state.isProcessing]);

  const updateSetting = <K extends keyof EnhanceSettings>(key: K, value: EnhanceSettings[K]) => {
    if (key !== 'detail') setTuneOpen(true); // a manual tweak means the user wants the sliders in view
    handleSetSettings({ ...state.settings, [key]: value });
  };
  const firstRun = state.isProcessing && !hasResults;
  const pct = state.progress ? Math.min(100, Math.round((state.progress.current / Math.max(1, state.progress.total)) * 100)) : 0;

  const outputMb = useMemo(() => {
    const bytes = state.results.reduce((n, r) => n + Math.round(r.dataUrl.length * 0.75), 0);
    return bytes / (1024 * 1024);
  }, [state.results]);

  const showingLive = !showBefore && toneDirty && !!live;
  const imgSrc = !selected ? '' : showBefore ? selected.originalDataUrl : showingLive ? (live as string) : selected.dataUrl;
  const badge = showBefore ? 'BEFORE' : showingLive ? 'LIVE PREVIEW' : toneDirty && liveBusy ? 'UPDATING…' : 'AFTER';
  const badgeClass = showBefore
    ? 'bg-warning-strong/90 text-warning-faint'
    : showingLive || (toneDirty && liveBusy)
      ? 'bg-primary-strong/90 text-white'
      : 'bg-success-strong/90 text-success-faint';

  return (
    <div className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="sr-only">
        {hasResults && !state.isProcessing ? `Enhancement complete. ${state.results.length} page${state.results.length === 1 ? '' : 's'} ready.` : ''}
      </p>

      {state.error && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-danger-deep/60 bg-danger-faint px-4 py-3 text-sm text-danger-soft">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
            <span>{state.error}</span>
          </div>
          {!hasResults && !state.isProcessing && (
            <div className="flex gap-2">
              <Button size="sm" onClick={handleApplySettings}>Try again</Button>
              <Button size="sm" variant="ghost" onClick={handleBackToArrange}>Change files</Button>
            </div>
          )}
        </div>
      )}

      {/* Escape hatch back to the arrange stage (invalidates stale results) */}
      {!state.isProcessing && (
        <button
          type="button"
          onClick={handleBackToArrange}
          className={`flex h-11 items-center justify-center gap-1.5 self-start rounded-lg border border-elevated/60 bg-surface/70 px-3.5 text-xs font-bold text-ink-muted transition-colors hover:border-primary/50 hover:text-primary-soft ${FOCUS}`}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Adjust file order
        </button>
      )}

      {/* Processing progress — big and focused on the first run, compact for every re-enhance */}
      {state.isProcessing && (
        <div role="status" className={`flex flex-col gap-3 rounded-2xl border border-surface-2 bg-surface/80 animate-enter ${firstRun ? 'items-center p-8 text-center' : 'p-4'}`}>
          {firstRun ? (
            <>
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary-faint">
                <Loader2 className="h-8 w-8 animate-spin text-primary-soft" aria-hidden="true" />
              </span>
              <h2 className="text-lg font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>Enhancing your pages</h2>
              <p className="max-w-xs text-sm text-ink-muted">Everything stays on this device. Keep this tab open — larger notebooks take a little longer.</p>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm font-bold text-ink">
              <Loader2 className="h-4 w-4 animate-spin text-primary-soft" aria-hidden="true" />
              Re-enhancing all pages…
            </div>
          )}
          {state.progress && (
            <div className="w-full">
              <div className="h-2 w-full overflow-hidden rounded-full bg-elevated" aria-hidden="true">
                <div className="h-full rounded-full transition-all duration-200" style={{ width: `${Math.max(4, pct)}%`, background: 'var(--gradient-brand)' }} />
              </div>
              <p className={`mt-2 truncate text-xs tabular-nums text-ink-muted ${firstRun ? '' : 'text-left'}`}>
                {state.progress.phase} · {state.progress.current}/{state.progress.total}{firstRun ? ` · ${pct}%` : ''}
              </p>
            </div>
          )}
          <Button variant="danger" fullWidth={!firstRun} onClick={handleCancelProcessing}>
            <Ban className="h-4 w-4" />
            Cancel
          </Button>
        </div>
      )}

      <div className={`flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6 ${firstRun ? 'hidden' : ''}`}>
        {/* ── Preview column ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {selected && (
            <div className="sticky top-[68px] z-20 -mx-4 flex flex-col gap-2 bg-bg/95 px-4 pb-2 pt-1 backdrop-blur-md lg:top-[84px] lg:mx-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold tracking-wide text-ink">
                  Preview <span className="font-normal text-ink-muted">· page {selected.index + 1} of {state.results.length}</span>
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setZoom((z) => !z)}
                    aria-pressed={zoom}
                    aria-label={zoom ? 'Zoom out' : 'Zoom in to check handwriting detail'}
                    className={`inline-flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${FOCUS} ${zoom ? 'border-primary/50 bg-primary-faint text-primary-soft' : 'border-elevated bg-surface text-ink'}`}
                  >
                    {zoom ? <ZoomOut className="h-4 w-4" aria-hidden="true" /> : <ZoomIn className="h-4 w-4" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBefore((b) => !b)}
                    aria-pressed={showBefore}
                    className={`inline-flex h-11 items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold transition-colors ${FOCUS} ${showBefore ? 'border-primary/50 bg-primary-faint text-primary-soft' : 'border-elevated bg-surface text-ink'}`}
                  >
                    <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {showBefore ? 'Before' : 'Compare'}
                  </button>
                </div>
              </div>

              <div
                className={`relative select-none overflow-auto rounded-2xl border border-surface-2 bg-surface/80 ${zoom ? 'max-h-[60vh]' : 'max-h-[36vh] lg:max-h-[72vh]'}`}
                style={{ WebkitTouchCallout: 'none', touchAction: zoom ? 'pan-x pan-y' : 'pan-y' } as React.CSSProperties}
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  if (zoom) return;
                  setShowBefore(true);
                  try {
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  } catch {
                    /* capture unsupported */
                  }
                }}
                onPointerUp={(e) => {
                  try {
                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                  } catch {
                    /* already released */
                  }
                  if (!zoom) setShowBefore(false);
                }}
                onPointerCancel={() => !zoom && setShowBefore(false)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgSrc}
                  alt={`${badge === 'BEFORE' ? 'Original' : 'Enhanced'} page ${selected.index + 1}`}
                  className={`pointer-events-none select-none ${zoom ? 'h-auto w-[220%] max-w-none' : 'mx-auto h-auto max-h-[36vh] w-auto max-w-full object-contain lg:max-h-[72vh]'}`}
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                />
                <span className={`pointer-events-none absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold tracking-wide ${badgeClass}`}>{badge}</span>
                {!zoom && (
                  <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-surface/80 px-2 py-1 text-xs font-medium text-ink backdrop-blur">
                    Hold to compare
                  </span>
                )}
              </div>
              {toneDirty && (
                <p role="status" className="text-xs font-semibold text-primary-soft">
                  Previewing this page only — tap Apply to update all {state.results.length} page{state.results.length === 1 ? '' : 's'}.
                </p>
              )}
            </div>
          )}

          {state.results.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Pages">
              {state.results.map((page) => (
                <button
                  key={page.index}
                  type="button"
                  role="tab"
                  aria-selected={state.selectedIndex === page.index}
                  aria-label={`Page ${page.index + 1}`}
                  onClick={() => {
                    handleSetSelected(page.index);
                    setShowBefore(false);
                  }}
                  className={`relative h-16 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${FOCUS} ${state.selectedIndex === page.index ? 'border-primary' : 'border-elevated/80'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={page.dataUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Settings column ────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 rounded-2xl border border-surface-2 bg-surface/80 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold tracking-wide text-ink">Enhancement settings</h2>
            {hasResults && !isDirty && <span className="inline-flex items-center gap-1 text-xs font-bold text-success"><Check className="h-3.5 w-3.5" aria-hidden="true" />Applied</span>}
          </div>

          <div>
            <span id="enh-presets" className="text-xs font-bold text-ink-muted">Quick start</span>
            <div role="group" aria-labelledby="enh-presets" className="mt-2 flex flex-wrap gap-2">
              {ENHANCE_PRESETS.map((p) => {
                const on = activePreset?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSetSettings({ ...p.settings, detail: state.settings.detail })}
                    aria-pressed={on}
                    title={p.hint}
                    className={`h-11 rounded-full border px-3.5 text-xs font-bold transition-colors ${FOCUS} ${on ? 'border-primary/50 bg-primary/15 text-primary-soft' : 'border-elevated bg-surface-2/60 text-ink-muted hover:bg-elevated hover:text-ink'}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-ink-faint">{activePreset ? activePreset.hint : 'Custom mix — fine-tune with the sliders.'}</p>
          </div>

          <div className="rounded-xl border border-surface-2/70">
            <button
              type="button"
              onClick={() => setTuneOpen((o) => !o)}
              aria-expanded={tuneOpen}
              aria-controls="enh-tune"
              className={`flex min-h-[52px] w-full items-center justify-between gap-2 px-3.5 text-left ${FOCUS}`}
            >
              <span>
                <span className="block text-sm font-bold text-ink">Fine-tune</span>
                <span className="block text-xs text-ink-faint">Darken {state.settings.darken} · Contrast {state.settings.contrast} · Sharpen {state.settings.sharpen}</span>
              </span>
              <ChevronDown className={`h-[18px] w-[18px] shrink-0 text-ink-faint transition-transform ${tuneOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {tuneOpen && (
              <div id="enh-tune" className="flex flex-col gap-4 border-t border-surface-2/70 p-3.5">
          <SliderRow label="Darken ink" hint="Push faint pencil/ink toward black" value={state.settings.darken} min={ENHANCE_SETTING_RANGE.darken[0]} max={ENHANCE_SETTING_RANGE.darken[1]} onChange={(v) => updateSetting('darken', v)} />
            <SliderRow label="Contrast" hint="Remove flat gray from scanned paper" value={state.settings.contrast} min={ENHANCE_SETTING_RANGE.contrast[0]} max={ENHANCE_SETTING_RANGE.contrast[1]} onChange={(v) => updateSetting('contrast', v)} />
            <SliderRow label="Sharpen" hint="Crisp handwriting edges" value={state.settings.sharpen} min={ENHANCE_SETTING_RANGE.sharpen[0]} max={ENHANCE_SETTING_RANGE.sharpen[1]} onChange={(v) => updateSetting('sharpen', v)} />
            <div className="flex flex-col divide-y divide-surface-2/70 border-t border-surface-2/70 pt-2">
              <ToggleRow label="Even out lighting" hint="Remove camera shadows and uneven light across the page" enabled={state.settings.evenLighting} onChange={(v) => updateSetting('evenLighting', v)} />
              <ToggleRow label="Clean background" hint="Map paper tint to pure white" enabled={state.settings.cleanBackground} onChange={(v) => updateSetting('cleanBackground', v)} />
              <ToggleRow label="Grayscale" hint="Monochrome output — maximum print contrast" enabled={state.settings.grayscale} onChange={(v) => updateSetting('grayscale', v)} />
            </div>
                {!activePreset && (
                  <button type="button" onClick={() => handleSetSettings({ ...DEFAULT_ENHANCE_SETTINGS, detail: state.settings.detail })} className={`self-start rounded-full border border-elevated bg-surface px-3.5 text-xs font-bold text-ink-muted hover:text-ink h-11 ${FOCUS}`}>
                    Reset to Balanced
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-surface-2/70 pt-3">
            <span id="enh-detail" className="text-sm font-bold text-ink">Print detail</span>
            <div role="group" aria-labelledby="enh-detail" className="mt-2 grid grid-cols-3 gap-2">
              {DETAILS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => updateSetting('detail', d)}
                  aria-pressed={state.settings.detail === d}
                  className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl border px-1 text-center transition-colors ${FOCUS} ${state.settings.detail === d ? 'border-primary/50 bg-primary/15 text-primary-soft' : 'border-elevated/60 bg-surface-2/60 text-ink-muted hover:bg-elevated'}`}
                >
                  <span className="text-xs font-extrabold">{ENHANCE_DETAIL_LABEL[d]}</span>
                  <span className="text-2xs tabular-nums text-ink-faint">{ENHANCE_DETAIL_DPI[d]} DPI</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-faint">Higher detail prints finer handwriting but is slower and makes a bigger file. Applies when you tap Apply.</p>
          </div>

          <Button size="lg" fullWidth onClick={handleApplySettings} loading={state.isProcessing} disabled={(!isDirty && hasResults) || state.exportBusy}>
            {!state.isProcessing && (isDirty ? <Wand2 className="h-4 w-4" /> : <Check className="h-4 w-4" />)}
            {state.isProcessing ? 'Enhancing…' : isDirty ? (hasResults ? 'Apply to all pages' : 'Enhance') : 'Up to date'}
          </Button>
        </div>
      </div>

      {/* Sticky action bar — filename + download left, layout right */}
      {!state.isProcessing && hasResults && (
        <div className="sticky bottom-0 z-20 -mx-4 border-t border-surface-2 bg-bg/95 px-4 pt-3 backdrop-blur-md" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="mb-2">
            <FileNameField baseName={outBase} onChange={setOutBase} suffix="-PrintReady.pdf" label="Filename" />
          </div>
          <div className={`grid gap-2 ${onChooseLayout ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <Button size="lg" loading={state.exportBusy} onClick={() => handleDownloadPrintPdf(outBase)} disabled={toneDirty || detailDirty}>
              {!state.exportBusy && (state.pdfBlob ? <Check className="h-4 w-4" /> : <Download className="h-4 w-4" />)}
              {state.exportBusy ? 'Building…' : state.pdfBlob ? 'Download again' : 'Download PDF'}
            </Button>
            {onChooseLayout && (
              <button
                type="button"
                onClick={onChooseLayout}
                disabled={state.exportBusy || toneDirty || detailDirty}
                style={{ background: 'var(--gradient-brand)' }}
                className={`flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-md shadow-primary/25 transition-transform duration-150 active:scale-[0.98] disabled:opacity-50 ${FOCUS}`}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                Choose layout
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-xs text-ink-faint">
            {toneDirty || detailDirty
              ? 'Settings changed — apply them first so the download matches the preview.'
              : state.pdfBlob
                ? `Saved as ${state.fileName} · ${state.results.length} page${state.results.length === 1 ? '' : 's'}`
                : `${state.results.length} page${state.results.length === 1 ? '' : 's'} · about ${outputMb < 10 ? outputMb.toFixed(1) : Math.round(outputMb)} MB · original page sizes kept`}
          </p>

          <div className="mt-1 flex items-center justify-center gap-5">
            {state.pdfBlob && typeof navigator !== 'undefined' && 'share' in navigator && (
              <button type="button" onClick={handleSharePdf} className={`flex h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-accent-soft transition-colors hover:bg-surface-2 ${FOCUS}`}>
                <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                Share PDF
              </button>
            )}
            <button type="button" onClick={handleReset} className={`flex h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink ${FOCUS}`}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Start over with new PDFs
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
