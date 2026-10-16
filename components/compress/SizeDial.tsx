import React from 'react';
import { formatBytes, savedPercent } from '@/lib/compress/types';

export interface SizeDialProps {
  original: number;
  /** Predicted size, or null while it is being worked out. */
  predicted: number | null;
  busy: boolean;
  busyLabel?: string;
  label?: string;
}

const R = 52;
const C = 2 * Math.PI * R;

/** The hero of the Studio: a ring that shrinks to the predicted size, with the number in the middle. */
export const SizeDial: React.FC<SizeDialProps> = ({ original, predicted, busy, busyLabel, label = 'Estimated size' }) => {
  const ratio = predicted !== null && original > 0 ? Math.min(1, Math.max(0.02, predicted / original)) : 1;
  const pct = predicted !== null ? savedPercent(original, predicted) : 0;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[236px] sm:max-w-[280px]" role="img" aria-label={predicted !== null ? `${label}: ${formatBytes(predicted)}, ${pct} percent smaller` : 'Working out the new size'}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="9" />
        {/* the original size, as a faint full ring */}
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-elevated)" strokeWidth="9" strokeDasharray={`${C} ${C}`} opacity="0.5" />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={busy ? `${C * 0.22} ${C}` : `${C * ratio} ${C}`}
          className={busy ? 'origin-center animate-spin' : 'transition-[stroke-dasharray] duration-700 ease-out'}
          style={busy ? { transformOrigin: '60px 60px', animationDuration: '1.4s' } : undefined}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {busy || predicted === null ? (
          <>
            <span className="text-sm font-bold text-ink-muted">Reading your PDF…</span>
            {busyLabel && <span className="mt-1 text-xs tabular-nums text-ink-faint">{busyLabel}</span>}
          </>
        ) : (
          <>
            <span className="text-2xs font-bold uppercase tracking-[0.14em] text-ink-faint">{label}</span>
            <span className="mt-0.5 font-mono text-[2.3rem] sm:text-[2.6rem] font-semibold leading-none tabular-nums text-ink" style={{ fontFamily: 'var(--font-display)' }}>
              {formatBytes(predicted)}
            </span>
            <span className="mt-1.5 text-xs tabular-nums text-ink-muted">
              was {formatBytes(original)}
            </span>
            {pct > 0 && <span className="mt-2 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-extrabold text-accent-soft">−{pct}%</span>}
          </>
        )}
      </div>
    </div>
  );
};
