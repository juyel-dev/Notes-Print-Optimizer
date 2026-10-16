'use client';

import React from 'react';
import { AlertCircle, FileText, Layers, RotateCcw, Shrink } from 'lucide-react';
import type { CompressWorkflow } from '@/lib/compress/useCompressWorkflow';
import { COMPRESS_LEVELS, MODE_LABEL, formatBytes, pickLevelForTarget, type CompressMode } from '@/lib/compress/types';
import { SizeDial } from './SizeDial';
import { StrengthLadder } from './StrengthLadder';
import { TargetPicker } from './TargetPicker';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft';

const MODES: Array<{ key: CompressMode; icon: React.ElementType; title: string; text: string }> = [
  { key: 'smart', icon: FileText, title: 'Keep text', text: 'Shrinks images; text stays selectable.' },
  { key: 'flatten', icon: Layers, title: 'Flatten pages', text: 'Smaller files; text becomes part of each page image.' },
];

const SectionTitle: React.FC<{ n: string; children: React.ReactNode }> = ({ n, children }) => (
  <h2 className="mb-3 flex items-baseline gap-2.5 text-sm font-extrabold text-ink">
    <span className="font-mono text-xs font-bold text-accent-soft">{n}</span>
    {children}
  </h2>
);

/** The heart of Compress PDF: a live size dial, the mode choice, a target, and a ladder of strengths. */
export const CompressStudioView: React.FC<{ workflow: CompressWorkflow }> = ({ workflow }) => {
  const { state, setMode, setLevel, setTarget, handleRun } = workflow;
  const a = state.analysis!;
  const original = a.fileBytes;
  const sizes = state.estimates[state.mode];
  const predicted = sizes?.[state.level - 1] ?? null;
  const busy = state.estimating === state.mode || (sizes === undefined && state.error === null);
  const other: CompressMode = state.mode === 'smart' ? 'flatten' : 'smart';
  const otherSizes = state.estimates[other];

  // Target feedback
  let targetNote: React.ReactNode = null;
  if (state.target !== null && sizes) {
    const pick = pickLevelForTarget(sizes, state.target);
    if (state.target >= original) {
      targetNote = <>Your file is already under {formatBytes(state.target)}. We’ll still tidy it a little.</>;
    } else if (pick.reachable) {
      targetNote = (
        <>
          <b className="text-ink">{COMPRESS_LEVELS[pick.level - 1].label}</b> should land around <b className="text-ink">{formatBytes(sizes[pick.level - 1])}</b>, under your {formatBytes(state.target)} limit.
        </>
      );
    } else {
      const otherPick = otherSizes ? pickLevelForTarget(otherSizes, state.target) : null;
      targetNote = (
        <>
          Even <b className="text-ink">Extreme</b> in {MODE_LABEL[state.mode]} mode lands near <b className="text-ink">{formatBytes(sizes[4])}</b>.{' '}
          {otherPick?.reachable ? (
            <>
              {MODE_LABEL[other]} could reach about <b className="text-ink">{formatBytes(otherSizes![otherPick.level - 1])}</b>.
            </>
          ) : otherSizes ? (
            <>{MODE_LABEL[other]} can’t reach it either. Try splitting the PDF into parts.</>
          ) : (
            <>{MODE_LABEL[other]} may get lower.</>
          )}
          <button type="button" onClick={() => setMode(other)} className={`ml-2 rounded-full bg-accent px-3 py-1 text-xs font-extrabold text-bg ${FOCUS}`}>
            {otherSizes ? `Switch to ${MODE_LABEL[other]}` : `Check ${MODE_LABEL[other]}`}
          </button>
        </>
      );
    }
  }

  const nothingToShrink = state.mode === 'smart' && sizes !== undefined && a.eligibleBytes === 0;

  return (
    <div className="flex flex-col gap-5 pb-28 lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-8 lg:pb-8">
      {/* ── The dial ─────────────────────────────────────────────── */}
      <section
        aria-label="Estimated result"
        className="flex flex-col items-center gap-4 rounded-[28px] border border-accent/25 p-5 lg:sticky lg:top-[88px]"
        style={{ background: 'radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--color-accent) 16%, transparent), transparent 65%), var(--color-surface)' }}
      >
        <div className="flex w-full items-center gap-2.5 rounded-2xl border border-surface-2 bg-bg/60 px-3 py-2">
          <FileText className="h-4 w-4 shrink-0 text-accent-soft" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{state.source?.name}</span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-ink-muted">
            {a.pageCount} pg · {formatBytes(original)}
          </span>
        </div>
        <SizeDial
          original={original}
          predicted={predicted}
          busy={busy}
          busyLabel={state.estimateProgress ? `${state.estimateProgress.done}/${state.estimateProgress.total} sampled` : undefined}
        />
              </section>

      <div className="flex flex-col gap-7">
        {state.error && (
          <div role="alert" className="flex items-start gap-2 rounded-2xl border border-danger-deep/60 bg-danger-faint px-4 py-3 text-sm text-danger-soft">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
            <span>{state.error}</span>
          </div>
        )}

        {/* ── 01 Mode ─────────────────────────────────────────── */}
        <section aria-label="How to shrink">
          <SectionTitle n="01">Compression mode</SectionTitle>
          <div role="radiogroup" aria-label="Compression mode" className="grid gap-2.5 sm:grid-cols-2">
            {MODES.map((m) => {
              const on = state.mode === m.key;
              const rec = a.recommendedMode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMode(m.key)}
                  className={`relative flex min-h-[92px] flex-col gap-1.5 rounded-2xl border p-3.5 text-left transition-colors ${FOCUS} ${on ? 'border-accent/60 bg-accent/10' : 'border-surface-2 bg-surface/70 hover:border-elevated'}`}
                >
                  <span className="flex items-center gap-2 text-sm font-extrabold text-ink">
                    <m.icon className={`h-4 w-4 ${on ? 'text-accent-soft' : 'text-ink-faint'}`} aria-hidden="true" />
                    {m.title}
                    {rec && <span className="rounded-full bg-success/15 px-2 py-0.5 text-2xs font-extrabold uppercase tracking-wide text-success">Recommended</span>}
                  </span>
                  <span className="text-xs leading-relaxed text-ink-muted">{m.text}</span>
                </button>
              );
            })}
          </div>
          {nothingToShrink && (
            <p role="status" className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs font-semibold text-warning">
              No pictures we can shrink were found in this file, so Keep text can’t reduce it. Flatten pages can.
            </p>
          )}
        </section>

        {/* ── 02 Target ───────────────────────────────────────── */}
        <section aria-label="Target size">
          <SectionTitle n="02">Target size <span className="font-medium text-ink-faint">(optional)</span></SectionTitle>
          <TargetPicker target={state.target} onChange={setTarget} />
          {targetNote && (
            <p role="status" className="mt-3 rounded-xl border border-accent/25 bg-accent/10 px-3 py-2.5 text-xs leading-relaxed text-ink-muted">
              {targetNote}
            </p>
          )}
        </section>

        {/* ── 03 Strength ─────────────────────────────────────── */}
        <section aria-label="Strength">
          <SectionTitle n="03">{state.target !== null ? 'Strength for target' : 'Compression strength'}</SectionTitle>
          <StrengthLadder original={original} sizes={sizes} level={state.level} onChange={setLevel} target={state.target} />
        </section>
      </div>

      {/* ── Action bar ───────────────────────────────────────── */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-surface-2 bg-bg/92 px-4 pt-3 backdrop-blur-md lg:static lg:col-span-2 lg:border-0 lg:bg-transparent lg:px-0 lg:pt-0 lg:backdrop-blur-none"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            type="button"
            onClick={handleRun}
            disabled={busy}
            className={`inline-flex min-h-[56px] flex-1 items-center justify-center gap-2.5 rounded-2xl bg-accent px-5 text-base font-extrabold text-bg shadow-lg shadow-accent/20 transition-[transform,filter] duration-150 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 ${FOCUS}`}
          >
            <Shrink className="h-5 w-5" aria-hidden="true" />
            {busy ? 'Reading your PDF…' : 'Compress PDF'}
          </button>
          <button
            type="button"
            onClick={workflow.handleReset}
            aria-label="Choose a different file"
            title="Choose a different file"
            className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-elevated bg-surface text-ink-muted hover:text-ink ${FOCUS}`}
          >
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};
