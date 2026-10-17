'use client';

import React, { useEffect, useRef } from 'react';
import { ArrowLeft, LayoutPanelTop, Loader2 } from 'lucide-react';
import { useOrganizeWorkflow } from '@/lib/organize/useOrganizeWorkflow';
import { useSeoVisibility } from '@/components/seo/SeoVisibilityContext';
import { OrganizeUploadView } from './OrganizeUploadView';
import { OrganizeStudioView } from './OrganizeStudioView';
import { OrganizeResultView } from './OrganizeResultView';

export interface OrganizeToolViewProps {
  onBack: () => void;
}

/**
 * Organize Pages — upload → light table (select / turn / move / delete / find blanks) → export.
 * Distinct by shape, not hue: paper sheets on a dotted table, a floating action dock, inverted ink buttons.
 */
export const OrganizeToolView: React.FC<OrganizeToolViewProps> = ({ onBack }) => {
  const workflow = useOrganizeWorkflow();
  const { state } = workflow;
  const { setVisible } = useSeoVisibility();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const stage = state.step === 'exporting' ? 'studio' : state.step;

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
  }, [stage]);

  return (
    <div className="flex flex-col gap-5 animate-enter">
      <header className="flex items-center gap-3 border-b border-surface-2/70 pb-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to tools"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-elevated/60 bg-surface/80 text-ink transition-transform duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-elevated bg-surface-2 text-primary-soft" aria-hidden="true">
          <LayoutPanelTop className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 ref={titleRef} tabIndex={-1} className="truncate text-base font-extrabold text-ink" style={{ fontFamily: 'var(--font-display)', outline: 'none' }}>
            Organize Pages
          </h1>
          <p className="truncate text-xs text-ink-faint">Turn, move, delete · 100% on-device</p>
        </div>
      </header>

      {stage === 'upload' && <OrganizeUploadView workflow={workflow} />}
      {stage === 'loading' && (
        <section role="status" className="flex flex-col items-center gap-3 rounded-[32px] border border-surface-2 bg-surface/80 px-6 py-14 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-soft" aria-hidden="true" />
          <p className="text-lg font-extrabold text-ink" style={{ fontFamily: 'var(--font-display)' }}>Opening your PDF</p>
          <p className="max-w-xs truncate text-xs text-ink-muted">{state.source?.name}</p>
        </section>
      )}
      {stage === 'studio' && state.source && <OrganizeStudioView workflow={workflow} />}
      {stage === 'done' && state.result && <OrganizeResultView workflow={workflow} />}
    </div>
  );
};
