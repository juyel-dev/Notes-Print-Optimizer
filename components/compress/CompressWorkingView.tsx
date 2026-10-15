'use client';

import React from 'react';
import { Ban } from 'lucide-react';
import { PressIllustration } from './PressIllustration';

export interface CompressWorkingViewProps {
  title: string;
  label?: string;
  /** 0–100, or null for an indeterminate wait. */
  pct: number | null;
  onCancel?: () => void;
}

/** Shared "the press is running" screen — used while reading a file and while compressing. */
export const CompressWorkingView: React.FC<CompressWorkingViewProps> = ({ title, label, pct, onCancel }) => (
  <section role="status" aria-live="polite" className="flex flex-col items-center gap-4 rounded-[32px] border border-accent/25 bg-surface/80 px-6 py-10 text-center animate-enter">
    <PressIllustration className="h-28 w-40" />
    <h2 className="text-2xl font-extrabold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{title}</h2>
    {pct !== null && (
      <p className="font-mono text-5xl font-semibold tabular-nums text-accent-soft" style={{ fontFamily: 'var(--font-display)' }}>
        {pct}
        <span className="text-2xl text-ink-faint">%</span>
      </p>
    )}
    <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
      <div
        className={`h-full rounded-full bg-accent transition-[width] duration-300 ${pct === null ? 'cp-sheen relative w-1/3 overflow-hidden' : ''}`}
        style={pct === null ? undefined : { width: `${Math.max(4, pct)}%` }}
      />
    </div>
    {label && <p className="max-w-xs truncate text-xs tabular-nums text-ink-muted">{label}</p>}
    <p className="max-w-xs text-xs text-ink-faint">Everything stays on this device. Keep this tab open.</p>
    {onCancel && (
      <button type="button" onClick={onCancel} className="mt-1 inline-flex h-11 items-center gap-2 rounded-full border border-elevated bg-surface px-5 text-sm font-bold text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft">
        <Ban className="h-4 w-4" aria-hidden="true" />
        Cancel
      </button>
    )}
  </section>
);
