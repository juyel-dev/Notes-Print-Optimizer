'use client';

import React, { memo, useEffect, useMemo, useRef } from 'react';
import { ProcessingProgress } from '@/lib/optimizer/types';
import { Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { useDialogFocus } from '@/lib/ui/useDialogFocus';

interface ProcessingModalProps {
  progress: ProcessingProgress | null;
  phaseTitle?: string;
  onCancel?: () => void;
  progressiveThumbnails?: Map<number, string>;
}

/** Engine progress strings carry an internal "[V2] " tag; users never need it. */
export function cleanActionText(text: string | undefined): string {
  return (text ?? '').replace(/^\s*\[[A-Za-z0-9._-]+\]\s*/, '').trim();
}

/** "12s", "1m 05s" — whole seconds, no flicker from decimals. */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/**
 * Time-left estimate from the real average per page. Withheld until enough
 * pages are done for the average to mean something, so it never flashes a
 * wild first guess.
 */
export function estimateRemainingMs(p: ProcessingProgress): number | null {
  if (p.totalPages <= 0 || p.currentPage < 3 || p.elapsedMs <= 0) return null;
  if (p.currentPage >= p.totalPages) return null;
  const perPage = p.elapsedMs / p.currentPage;
  return perPage * (p.totalPages - p.currentPage);
}

/**
 * One finished-page thumbnail. Memoized on (index, url): a progress tick that
 * does not add a page re-renders none of these, instead of re-reconciling up
 * to a few hundred <img> nodes on every update.
 */
const ThumbItem = memo(function ThumbItem({ index, url }: { index: number; url: string }) {
  return (
    <div className="animate-enter shrink-0 w-16 h-12 overflow-hidden rounded-md border border-elevated/50 bg-surface-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`Page ${index + 1}`}
        width={64}
        height={48}
        decoding="async"
        draggable={false}
        className="h-full w-full object-contain"
      />
    </div>
  );
});

const CompletedStrip = memo(function CompletedStrip({ thumbs }: { thumbs: Map<number, string> }) {
  const items = useMemo(() => Array.from(thumbs.entries()).sort(([a], [b]) => a - b), [thumbs]);
  const railRef = useRef<HTMLDivElement>(null);

  // Keep the newest page in view as the strip grows.
  useEffect(() => {
    const el = railRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [items.length]);

  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <span className="mb-2 block text-2xs font-bold uppercase tracking-wider text-ink-muted">
        Completed pages ({items.length})
      </span>
      <div ref={railRef} className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
        {items.map(([idx, url]) => (
          <ThumbItem key={idx} index={idx} url={url} />
        ))}
      </div>
    </div>
  );
});

export const ProcessingModal: React.FC<ProcessingModalProps> = ({ progress, phaseTitle, onCancel, progressiveThumbnails }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const isOpen = !!(progress && progress.stage !== 'COMPLETE');

  useDialogFocus({ open: isOpen, containerRef: modalRef });

  if (!progress || progress.stage === 'COMPLETE') return null;

  const remainingMs = estimateRemainingMs(progress);
  const percent = Math.min(100, Math.max(0, progress.percent));
  // Screen readers get a calm update every 10% instead of one per page.
  const announce = `${Math.floor(percent / 10) * 10}% complete`;

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="processing-modal-title"
      /* Solid scrim, no backdrop-blur: blurring the whole viewport every frame
         costs GPU time proportional to window size and competes with the page
         rendering this dialog is waiting on. */
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/90 p-0 pb-safe animate-fade-in sm:items-center sm:p-4"
    >
      <div className="relative flex w-full max-w-md flex-col rounded-t-3xl border border-surface-2 bg-surface p-6 text-ink shadow-float animate-slide-up sm:rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary-strong/20 text-primary-soft">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-2xs font-bold uppercase tracking-wider text-primary-soft">
              {phaseTitle || 'Processing'}
            </span>
            <h3 id="processing-modal-title" className="truncate text-sm font-bold text-ink">
              {cleanActionText(progress.currentAction) || 'Working on your document…'}
            </h3>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-xs font-semibold text-ink-muted">
            <span className="tabular-nums">
              {progress.totalPages > 0
                ? `Page ${progress.currentPage} of ${progress.totalPages}`
                : 'Getting things ready…'}
            </span>
            <span className="font-mono text-sm font-bold tabular-nums text-primary-soft">{percent}%</span>
          </div>

          <div
            className="h-3 w-full overflow-hidden rounded-full border border-elevated/50 bg-surface-2"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={cleanActionText(progress.currentAction) || 'Processing document'}
          >
            {/* transform, not width: the fill animates on the compositor and
                never triggers layout. */}
            <div
              className="h-full w-full origin-left rounded-full bg-gradient-to-r from-primary via-accent-soft to-success transition-transform duration-300 ease-out will-change-transform"
              style={{ transform: `scaleX(${Math.max(0.05, percent / 100)})` }}
            />
          </div>

          <p className="sr-only" role="status" aria-live="polite">
            {announce}
          </p>
        </div>

        {progressiveThumbnails && <CompletedStrip thumbs={progressiveThumbnails} />}

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-surface-2 pt-3 text-[11px] text-ink-muted">
          <span className="flex min-w-0 items-center gap-1 font-medium text-success">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">Private — runs on your device</span>
          </span>
          <div className="flex shrink-0 items-center gap-3">
            {progress.elapsedMs > 0 && (
              <span className="font-mono tabular-nums text-ink-muted">
                {formatDuration(progress.elapsedMs)}
                {remainingMs !== null && <> · ~{formatDuration(remainingMs)} left</>}
              </span>
            )}
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex items-center gap-1 rounded-md bg-danger-faint/40 px-2.5 py-1.5 text-2xs font-bold text-danger-soft transition-colors hover:bg-danger-faint/60"
              >
                <XCircle className="h-3 w-3" aria-hidden="true" /> Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
