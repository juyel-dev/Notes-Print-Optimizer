'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import {
  NUP_FORMATS,
  nupGrid,
  planSheet,
  totalSheetsFor,
  type NupFormat,
  type NupOptions,
  type NupOrientation,
  type NupPaper,
} from '@/lib/nup/nupLayout';
import { buildNup, loadNupDeps, type BuildResult } from '@/lib/nup/nupService';
import { NupLivePreview } from '@/components/nup/NupLivePreview';

const PAPER_MM = { A4: [210, 297], LETTER: [216, 279], LEGAL: [216, 356] } as const;

export interface PrintLayoutStepProps {
  /**
   * A single, already-flattened PDF — one full-size image per page, no
   * grid/margins/borders/numbers baked in yet (see
   * PdfExporter.flattenActivePagesToPdf for how the caller produces this).
   * Null while the caller is still preparing it — this component has no
   * opinion about *why* it's null (upload in progress, whitening still
   * running, anything else); it just waits.
   *
   * This is the ENTIRE input contract. No excludedPages, no
   * keepOriginalPages, no manualWhiteBoxRegions, no knowledge of any other
   * step — every one of those concerns is resolved by whoever produces
   * these bytes, before this component ever mounts. That's what keeps this
   * step swappable/independently modifiable: it cannot depend on another
   * step's internals it was never given.
   */
  flattenedPdfBytes: Uint8Array | null;
  totalPages: number;
  onGenerated: (result: BuildResult, opts: NupOptions) => void;
  onBack: () => void;
  backLabel?: string;
}

/**
 * The layout step — N-up format, paper, orientation, margins, borders,
 * page numbers, instant live real-page preview, vector export. This is
 * the standalone N-up tool's own layout screen (components/nup/NupToolView.tsx),
 * extracted so both the standalone tool and dark-print's Step 3 share one
 * real implementation instead of two that could drift. The only thing
 * deliberately NOT reused here is mergeBytes()/multi-file upload — this
 * step always receives exactly one already-prepared document.
 */
export const PrintLayoutStep: React.FC<PrintLayoutStepProps> = ({
  flattenedPdfBytes,
  totalPages,
  onGenerated,
  onBack,
  backLabel = 'Back',
}) => {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<NupFormat>('2x2');
  const [paper, setPaper] = useState<NupPaper>('A4');
  const [orientation, setOrientation] = useState<NupOrientation>('PORTRAIT');
  const [outerMm, setOuterMm] = useState(5);
  const [innerMm, setInnerMm] = useState(3);
  const [borders, setBorders] = useState(true);
  const [numbers, setNumbers] = useState(true);

  const opts: NupOptions = useMemo(
    () => ({ format, paper, orientation, margins: { outer: outerMm, inner: innerMm }, borders, numbers }),
    [format, paper, orientation, outerMm, innerMm, borders, numbers],
  );
  const grid = useMemo(() => nupGrid(format, orientation), [format, orientation]);
  const perSheet = grid.cols * grid.rows;
  const totalSheets = useMemo(() => (totalPages ? totalSheetsFor(totalPages, perSheet) : 0), [totalPages, perSheet]);
  const [pwMM, phMM] = PAPER_MM[paper];

  // Warm the pdf-lib/pdf.js deps as soon as bytes are ready — same lazy-load
  // pattern as the standalone tool, just triggered by prop arrival instead
  // of a step transition.
  useEffect(() => {
    if (flattenedPdfBytes) void loadNupDeps();
  }, [flattenedPdfBytes]);

  const generate = async () => {
    if (!flattenedPdfBytes) return;
    setBusy(true);
    setError(null);
    try {
      const result = await buildNup(flattenedPdfBytes, opts, (d, t) => setProgress(`Building sheet ${d}/${t}…`));
      onGenerated(result, opts);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message.slice(0, 180) : 'Layout failed.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  if (!flattenedPdfBytes) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-surface-2 bg-surface/90 p-8 shadow-lg">
        <Loader2 className="h-6 w-6 animate-spin text-primary-soft" aria-hidden="true" />
        <p className="text-sm font-semibold text-ink-muted">Preparing pages for layout…</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
      <section aria-label="Layout options" className="rounded-2xl border border-surface-2 bg-surface/90 p-3.5 shadow-lg sm:p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-ink">Pages per sheet</span>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary-soft">
            {totalPages} → {totalSheets} sheet{totalSheets === 1 ? '' : 's'}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="N-up format">
          {NUP_FORMATS.map((o) => (
            <button key={o.format} type="button" role="radio" aria-checked={format === o.format} onClick={() => setFormat(o.format)}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-2.5 transition active:scale-[0.97] ${
                format === o.format ? 'border-primary/50 bg-primary/15 text-primary-soft shadow-sm' : 'border-elevated/60 bg-surface-2/40 text-ink-muted hover:bg-elevated'
              }`}>
              <span className="text-sm font-extrabold">{o.label}</span>
              <span className="text-2xs leading-none text-ink-faint">{o.sub}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
          <div role="group" aria-label="Paper size" className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-ink-muted">Paper</span>
            <div className="inline-flex rounded-full border border-elevated bg-surface-2/50 p-0.5">
              {(['A4', 'LETTER', 'LEGAL'] as const).map((p) => (
                <button key={p} type="button" onClick={() => setPaper(p)} aria-pressed={paper === p}
                  className={`h-8 rounded-full px-3.5 text-xs font-bold transition ${paper === p ? 'bg-primary-strong text-white shadow-sm' : 'text-ink-muted hover:text-ink'}`}>
                  {p === 'LETTER' ? 'Letter' : p === 'LEGAL' ? 'Legal' : 'A4'}
                </button>
              ))}
            </div>
          </div>
          <div role="group" aria-label="Orientation" className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-ink-muted">Orientation</span>
            <div className="inline-flex rounded-full border border-elevated bg-surface-2/50 p-0.5">
              {(['PORTRAIT', 'LANDSCAPE'] as const).map((o) => (
                <button key={o} type="button" onClick={() => setOrientation(o)} aria-pressed={orientation === o}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition ${orientation === o ? 'bg-primary-strong text-white shadow-sm' : 'text-ink-muted hover:text-ink'}`}>
                  <svg viewBox="0 0 10 14" className={`h-3.5 ${o === 'LANDSCAPE' ? 'w-4 rotate-90' : 'w-2.5'}`} aria-hidden="true">
                    <rect x={0.5} y={0.5} width={9} height={13} rx={1} className={orientation === o ? 'fill-white/90' : 'fill-current opacity-60'} />
                  </svg>
                  {o === 'PORTRAIT' ? 'Portrait' : 'Landscape'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-surface-2 pt-3">
          <label className="block">
            <span className="flex items-center justify-between text-xs font-bold text-ink-muted">
              Outer margin <span className="tabular-nums text-primary-soft">{outerMm} mm</span>
            </span>
            <input type="range" min={0} max={20} step={1} value={outerMm} onChange={(e) => setOuterMm(Number(e.target.value))}
              aria-label="Outer margin in millimetres"
              className="mt-2 w-full cursor-pointer appearance-none rounded-full bg-elevated py-1.5 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-primary-strong [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-primary-strong" />
          </label>
          <label className="block">
            <span className="flex items-center justify-between text-xs font-bold text-ink-muted">
              Gap between cells <span className="tabular-nums text-primary-soft">{innerMm} mm</span>
            </span>
            <input type="range" min={0} max={15} step={1} value={innerMm} onChange={(e) => setInnerMm(Number(e.target.value))}
              aria-label="Gap between cells in millimetres"
              className="mt-2 w-full cursor-pointer appearance-none rounded-full bg-elevated py-1.5 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-primary-strong [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-primary-strong" />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-surface-2 pt-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" checked={borders} onChange={(e) => setBorders(e.target.checked)} className="h-4 w-4 rounded border-elevated accent-[var(--color-primary)]" /> Cell borders
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" checked={numbers} onChange={(e) => setNumbers(e.target.checked)} className="h-4 w-4 rounded border-elevated accent-[var(--color-primary)]" /> Page numbers
          </label>
          <span className="ml-auto text-[11px] tabular-nums text-ink-faint">{pwMM}×{phMM} mm · vector · pdf-lib</span>
        </div>

        {error && <p role="alert" className="mt-3 rounded-xl border border-danger/30 bg-danger-faint/50 px-3 py-2 text-xs font-semibold text-danger">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onBack}
            className="inline-flex h-11 items-center gap-1.5 rounded-full border border-elevated bg-surface px-5 text-sm font-bold text-ink hover:bg-surface-2">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {backLabel}
          </button>
          <button type="button" onClick={generate} disabled={busy || totalPages === 0}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary-strong px-5 text-sm font-bold text-white shadow-md shadow-primary/20 hover:bg-primary active:scale-[0.98] disabled:opacity-40">
            {busy ? (<><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{progress ?? 'Building…'}</>) : (`Generate ${perSheet}-up PDF`)}
          </button>
        </div>
      </section>

      {/* Live real-page preview — instant, auto-composed from cache */}
      <section aria-label="Live sheet preview" className="flex flex-col gap-3 rounded-2xl border border-surface-2 bg-surface/90 p-3.5 shadow-lg lg:sticky lg:top-[76px] sm:p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-ink">Live preview</span>
          <span className="rounded-full border border-elevated bg-surface-2/60 px-2 py-0.5 text-[11px] font-bold tabular-nums text-ink-muted">
            {orientation === 'LANDSCAPE' ? 'landscape' : 'portrait'} · your pages
          </span>
        </div>

        <NupLivePreview mergedBytes={flattenedPdfBytes} opts={opts} totalPages={totalPages} />

        <ul className="flex flex-col gap-1 border-t border-surface-2 pt-2 text-[11px] leading-relaxed text-ink-muted">
          <li className="flex justify-between"><span>Format</span><span className="font-bold text-ink">{perSheet} per sheet · {grid.cols}×{grid.rows}</span></li>
          <li className="flex justify-between"><span>Cell size</span><span className="font-bold tabular-nums text-ink">{Math.round(planSheet(opts).cellW / 2.8346)}×{Math.round(planSheet(opts).cellH / 2.8346)} mm</span></li>
          <li className="flex justify-between"><span>Margins</span><span className="font-bold tabular-nums text-ink">{outerMm} mm outer · {innerMm} mm gap</span></li>
          <li className="flex justify-between"><span>Total</span><span className="font-bold tabular-nums text-ink">{totalPages} pages → {totalSheets} sheets</span></li>
        </ul>
      </section>
    </div>
  );
};
