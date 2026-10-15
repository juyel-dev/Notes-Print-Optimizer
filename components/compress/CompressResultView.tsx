'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, RotateCcw, SlidersHorizontal, TriangleAlert, Check } from 'lucide-react';
import type { CompressWorkflow } from '@/lib/compress/useCompressWorkflow';
import { COMPRESS_LEVELS, MODE_LABEL, formatBytes, savedPercent } from '@/lib/compress/types';
import { renderPageDataUrl } from '@/lib/compress/flatten';
import { FileNameField } from '@/components/ui/FileNameField';
import { BeforeAfterWipe } from './BeforeAfterWipe';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft';

export const CompressResultView: React.FC<{ workflow: CompressWorkflow }> = ({ workflow }) => {
  const { state } = workflow;
  const result = state.result!;
  const before = state.source!.size;
  const pct = savedPercent(before, result.size);
  const pageCount = state.analysis?.pageCount ?? 1;
  const [outName, setOutName] = useState(state.source!.baseName);
  const [page, setPage] = useState(1);
  const [imgs, setImgs] = useState<{ before: string; after: string } | null>(null);
  const [loading, setLoading] = useState(!result.unchanged);
  const outBytes = useRef<Uint8Array | null>(null);
  const cache = useRef(new Map<number, { before: string; after: string }>());

  // Render the same page of both PDFs for the comparison.
  useEffect(() => {
    if (result.unchanged) return;
    const hit = cache.current.get(page);
    if (hit) {
      setImgs(hit);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const original = workflow.originalBytes();
        if (!original) return;
        if (!outBytes.current) outBytes.current = new Uint8Array(await result.blob.arrayBuffer());
        const [b, a] = await Promise.all([renderPageDataUrl(original, page, 900), renderPageDataUrl(outBytes.current, page, 900)]);
        const pair = { before: b.url, after: a.url };
        cache.current.set(page, pair);
        if (!cancelled) {
          setImgs(pair);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, result, workflow]);

  const missed = result.reachedTarget === false;

  return (
    <div className="flex flex-col gap-5">
      {/* ── The receipt ───────────────────────────────────────── */}
      <section
        aria-label="Result"
        className="overflow-hidden rounded-[32px] border border-accent/25 p-6 sm:p-8"
        style={{ background: 'radial-gradient(110% 90% at 0% 0%, color-mix(in srgb, var(--color-accent) 20%, transparent), transparent 60%), var(--color-surface)' }}
      >
        <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-accent-soft">
          <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
          {result.unchanged ? 'Already compact' : 'Done'}
        </p>
        <p className="mt-2 text-6xl font-black leading-none tracking-[-0.04em] text-ink sm:text-7xl" style={{ fontFamily: 'var(--font-display)' }}>
          {result.unchanged ? '0%' : <>−{pct}<span className="text-4xl text-ink-faint">%</span></>}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          {result.unchanged
            ? 'We couldn’t make this file any smaller without hurting it, so it is unchanged. Flatten pages may shrink it further.'
            : `${state.source!.name} is now ${formatBytes(result.size)}.`}
        </p>

        <dl className="mt-6 flex flex-col gap-3">
          <div>
            <dt className="flex justify-between text-xs font-bold text-ink-faint"><span>Before</span><span className="font-mono tabular-nums text-ink-muted">{formatBytes(before)}</span></dt>
            <dd className="mt-1.5 h-3 rounded-full bg-elevated" />
          </div>
          <div>
            <dt className="flex justify-between text-xs font-bold text-accent-soft"><span>After</span><span className="font-mono tabular-nums text-ink">{formatBytes(result.size)}</span></dt>
            <dd className="mt-1.5 h-3 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-out" style={{ width: `${Math.max(2, (result.size / before) * 100)}%` }} />
            </dd>
          </div>
        </dl>

        <p className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-ink-muted">
          {[MODE_LABEL[result.mode], COMPRESS_LEVELS[result.level - 1].label, `${pageCount} page${pageCount === 1 ? '' : 's'}`].map((t) => (
            <span key={t} className="rounded-full border border-surface-2 bg-bg/50 px-3 py-1">{t}</span>
          ))}
        </p>

        {result.target !== null && (
          <p
            role="status"
            className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${missed ? 'border-warning/30 bg-warning/10 text-warning' : 'border-success/30 bg-success/10 text-success'}`}
          >
            {missed ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            <span>
              {missed
                ? `This is the smallest we could get in ${MODE_LABEL[result.mode]} mode (${formatBytes(result.size)}), above your ${formatBytes(result.target)} limit. Try the other mode, or split the PDF into parts.`
                : `Under your ${formatBytes(result.target)} limit.`}
            </span>
          </p>
        )}
      </section>

      {/* ── Compare ───────────────────────────────────────────── */}
      {!result.unchanged && (
        <section aria-label="Compare quality" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold text-ink">Check the quality</h2>
            {pageCount > 1 && (
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={`flex h-11 w-11 items-center justify-center rounded-full border border-elevated bg-surface text-ink disabled:opacity-40 ${FOCUS}`}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="min-w-[72px] text-center font-mono text-xs tabular-nums text-ink-muted">{page} / {pageCount}</span>
                <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className={`flex h-11 w-11 items-center justify-center rounded-full border border-elevated bg-surface text-ink disabled:opacity-40 ${FOCUS}`}>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          <BeforeAfterWipe before={imgs?.before ?? null} after={imgs?.after ?? null} loading={loading} />
          <p className="text-xs text-ink-faint">Drag the handle to compare. If it looks too soft, go back and pick a gentler strength.</p>
        </section>
      )}

      {/* ── Save ──────────────────────────────────────────────── */}
      <section aria-label="Save" className="flex flex-col gap-3 rounded-2xl border border-surface-2 bg-surface/70 p-4">
        <FileNameField baseName={outName} onChange={setOutName} suffix="-compressed.pdf" label="Filename" />
        <button
          type="button"
          onClick={() => workflow.handleDownload(outName)}
          className={`inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl bg-accent px-5 text-base font-extrabold text-bg shadow-lg shadow-accent/20 transition-[transform,filter] duration-150 hover:brightness-110 active:scale-[0.98] ${FOCUS}`}
        >
          <Download className="h-5 w-5" aria-hidden="true" />
          Download PDF · {formatBytes(result.size)}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={workflow.backToStudio} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-elevated bg-surface text-sm font-bold text-ink ${FOCUS}`}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Adjust
          </button>
          <button type="button" onClick={workflow.handleReset} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-elevated bg-surface text-sm font-bold text-ink ${FOCUS}`}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Another PDF
          </button>
        </div>
      </section>
    </div>
  );
};
