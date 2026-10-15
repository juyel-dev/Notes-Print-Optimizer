'use client';

import React, { useEffect, useRef } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { useEnhanceWorkflow } from '@/lib/enhance/useEnhanceWorkflow';
import type { EnhanceStep } from '@/lib/enhance/types';
import { useSeoVisibility } from '@/components/seo/SeoVisibilityContext';
import { EnhanceUploadView } from './EnhanceUploadView';
import { EnhanceArrangeView } from './EnhanceArrangeView';
import { EnhanceWorkbenchView } from './EnhanceWorkbenchView';

export interface EnhanceToolViewProps {
  onBack: () => void;
  /** Enhance results -> main pipeline N-Up layout (optional bridge). */
  onHandoffToLayout?: (pages: Array<{ dataUrl: string; width: number; height: number }>) => void;
}

const STEPS: Array<{ key: EnhanceStep; label: string }> = [
  { key: 'upload', label: 'Upload' },
  { key: 'arrange', label: 'Arrange' },
  { key: 'enhance', label: 'Enhance' },
];

/**
 * Self-contained mobile tool: upload → arrange → enhance (download / N-Up).
 * Own top bar (back arrow exits to the landing tools box) and its own
 * internal state machine via useEnhanceWorkflow.
 */
export const EnhanceToolView: React.FC<EnhanceToolViewProps> = ({ onBack, onHandoffToLayout }) => {
  const workflow = useEnhanceWorkflow();
  const { state } = workflow;
  const { setVisible } = useSeoVisibility();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  // New step = new screen: start at the top and tell assistive tech where we are.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
  }, [state.step]);
  const stepIndex = STEPS.findIndex((x) => x.key === state.step);
  // Premium: About/FAQ/Related visible only on upload + finished workbench (Download ready).
  // While arranging or tweaking settings before any result, keep focus on the task.
  useEffect(() => {
    const isLastReady = state.step === 'enhance' && state.results.length > 0;
    setVisible(state.step === 'upload' || isLastReady);
    return () => setVisible(true);
  }, [state.step, state.results.length, setVisible]);

  return (
    <div className="flex flex-col gap-4 animate-slide-up">
      <header className="sticky top-0 z-30 -mx-4 flex items-center gap-3 border-b border-surface-2/70 bg-bg/90 px-4 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to tools"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-elevated/60 bg-surface/80 text-ink transition-transform duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 ref={titleRef} tabIndex={-1} className="truncate text-[15px] font-bold text-ink outline-none">Enhance Light PDF</h1>
          <p className="truncate text-xs text-ink-faint">Faint scans → clear printouts · 100% on-device</p>
        </div>
      </header>

      <ol aria-label="Progress" className="flex items-center gap-2 px-1">
        {STEPS.map((st, i) => {
          const done = i < stepIndex;
          const current = i === stepIndex;
          return (
            <React.Fragment key={st.key}>
              <li aria-current={current ? 'step' : undefined} className="flex items-center gap-2">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-extrabold tabular-nums transition-colors ${
                    done
                      ? 'border-success/40 bg-success/15 text-success'
                      : current
                        ? 'border-primary bg-primary-strong text-white shadow-md shadow-primary/25'
                        : 'border-elevated bg-surface text-ink-faint'
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : i + 1}
                </span>
                <span className={`text-xs font-bold ${current ? 'text-ink' : done ? 'text-ink-muted' : 'text-ink-faint'}`}>
                  {st.label}
                  <span className="sr-only">{done ? ' (done)' : current ? ' (current step)' : ''}</span>
                </span>
              </li>
              {i < STEPS.length - 1 && <span aria-hidden="true" className={`h-px flex-1 ${i < stepIndex ? 'bg-success/40' : 'bg-elevated'}`} />}
            </React.Fragment>
          );
        })}
      </ol>

      {state.step === 'upload' && <EnhanceUploadView workflow={workflow} />}
      {state.step === 'arrange' && <EnhanceArrangeView workflow={workflow} />}
      {state.step === 'enhance' && (
        <EnhanceWorkbenchView
          workflow={workflow}
          onChooseLayout={
            onHandoffToLayout
              ? () =>
                  onHandoffToLayout(
                    state.results.map((r) => ({ dataUrl: r.dataUrl, width: r.width, height: r.height })),
                  )
              : undefined
          }
        />
      )}
    </div>
  );
};