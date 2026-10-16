'use client';

import React, { useEffect, useRef } from 'react';
import { ArrowLeft, Shrink } from 'lucide-react';
import { useCompressWorkflow } from '@/lib/compress/useCompressWorkflow';
import type { CompressStep } from '@/lib/compress/compressReducer';
import { useSeoVisibility } from '@/components/seo/SeoVisibilityContext';
import { CompressUploadView } from './CompressUploadView';
import { CompressStudioView } from './CompressStudioView';
import { CompressResultView } from './CompressResultView';
import { CompressWorkingView } from './CompressWorkingView';

export interface CompressToolViewProps {
  onBack: () => void;
}

const RAIL: Record<CompressStep, number> = { upload: 4, analyzing: 25, studio: 50, working: 75, done: 100 };

/**
 * Compress PDF — upload → (analyze) → studio → (press) → result.
 * Deliberately its own look: marigold press hero, size dial, strength ladder.
 */
export const CompressToolView: React.FC<CompressToolViewProps> = ({ onBack }) => {
  const workflow = useCompressWorkflow();
  const { state } = workflow;
  const { setVisible } = useSeoVisibility();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => {
    setVisible(state.step === 'upload' || state.step === 'done');
    return () => setVisible(true);
  }, [state.step, setVisible]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
  }, [state.step]);

  return (
    <div className="flex flex-col gap-5 animate-enter">
      <header className="sticky top-0 z-30 -mx-4 border-b border-surface-2/70 bg-bg/90 backdrop-blur-md">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to tools"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-elevated/60 bg-surface/80 text-ink transition-transform duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-bg" aria-hidden="true">
            <Shrink className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 ref={titleRef} tabIndex={-1} className="truncate text-base font-extrabold text-ink" style={{ fontFamily: 'var(--font-display)', outline: 'none' }}>
              Compress PDF
            </h1>
            <p className="truncate text-xs text-ink-faint">Smaller files · 100% on-device</p>
          </div>
        </div>
        <div className="h-[3px] w-full bg-surface-2" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={RAIL[state.step]}>
          <div className="h-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${RAIL[state.step]}%` }} />
        </div>
      </header>

      {state.step === 'upload' && <CompressUploadView workflow={workflow} />}
      {state.step === 'analyzing' && <CompressWorkingView title="Reading your PDF" label={state.source?.name} pct={null} />}
      {state.step === 'studio' && state.analysis && <CompressStudioView workflow={workflow} />}
      {state.step === 'working' && (
        <CompressWorkingView title="Compressing" label={state.progress?.label} pct={state.progress?.pct ?? 0} onCancel={workflow.handleCancel} />
      )}
      {state.step === 'done' && state.result && <CompressResultView workflow={workflow} />}
    </div>
  );
};
