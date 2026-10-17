'use client';

import React, { useMemo, useState } from 'react';
import { Check, Download, FilePen, RotateCcw } from 'lucide-react';
import type { OrganizeWorkflow } from '@/lib/organize/useOrganizeWorkflow';
import { summarize } from '@/lib/organize/pageOps';
import { formatBytes } from '@/lib/compress/types';
import { FileNameField } from '@/components/ui/FileNameField';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft';

export const OrganizeResultView: React.FC<{ workflow: OrganizeWorkflow }> = ({ workflow }) => {
  const { state, dispatch } = workflow;
  const result = state.result!;
  const [name, setName] = useState(state.source!.baseName);
  const s = useMemo(() => summarize(state.items, state.source!.pageCount), [state.items, state.source]);

  const chips: string[] = [];
  if (result.selectionOnly) chips.push('Selected pages only');
  else {
    if (s.deleted > 0) chips.push(`${s.deleted} deleted`);
    if (s.rotated > 0) chips.push(`${s.rotated} turned`);
    if (s.duplicated > 0) chips.push(`${s.duplicated} duplicated`);
    if (s.blanks > 0) chips.push(`${s.blanks} blank added`);
    if (s.moved) chips.push('reordered');
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <section aria-label="Result" className="rounded-[32px] border border-surface-2 bg-surface p-7 text-center sm:p-9">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success" aria-hidden="true">
          <Check className="h-7 w-7" strokeWidth={3} />
        </span>
        <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.14em] text-success">Ready</p>
        <p className="mt-1 text-6xl font-black leading-none tracking-[-0.04em] text-ink" style={{ fontFamily: 'var(--font-display)' }}>
          {result.pages}
          <span className="ml-2 text-2xl font-bold tracking-normal text-ink-faint">page{result.pages === 1 ? '' : 's'}</span>
        </p>
        <p className="mt-3 font-mono text-sm tabular-nums text-ink-muted">{formatBytes(result.size)}</p>
        {chips.length > 0 && (
          <p className="mt-4 flex flex-wrap justify-center gap-2">
            {chips.map((c) => (
              <span key={c} className="rounded-full border border-surface-2 bg-bg/50 px-3 py-1 text-xs font-semibold text-ink-muted">{c}</span>
            ))}
          </p>
        )}
      </section>

      <section aria-label="Save" className="flex flex-col gap-3 rounded-2xl border border-surface-2 bg-surface/70 p-4">
        <FileNameField baseName={name} onChange={setName} suffix="-organized.pdf" label="Filename" />
        <button
          type="button"
          onClick={() => workflow.handleDownload(name)}
          className={`inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-full bg-ink px-5 text-base font-extrabold text-bg shadow-xl transition-transform duration-150 active:scale-[0.98] ${FOCUS}`}
        >
          <Download className="h-5 w-5" aria-hidden="true" />
          Download PDF
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => dispatch({ type: 'BACK_TO_STUDIO' })} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-elevated bg-surface text-sm font-bold text-ink ${FOCUS}`}>
            <FilePen className="h-4 w-4" aria-hidden="true" />
            Keep editing
          </button>
          <button type="button" onClick={workflow.handleReset} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-elevated bg-surface text-sm font-bold text-ink ${FOCUS}`}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Another PDF
          </button>
        </div>
      </section>
    </div>
  );
};
