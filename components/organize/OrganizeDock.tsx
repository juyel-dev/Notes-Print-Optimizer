'use client';

import React from 'react';
import { ArrowLeftToLine, ArrowRightToLine, Copy, FilePlus2, RotateCcw, RotateCw, Trash2 } from 'lucide-react';

export interface OrganizeDockProps {
  count: number;
  total: number;
  onRotate: (delta: number) => void;
  onNudge: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onBlank: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft';

const Btn: React.FC<{ label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }> = ({ label, onClick, disabled, danger, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-[background-color,transform,opacity] duration-150 active:scale-90 disabled:opacity-30 ${FOCUS} ${
      danger ? 'text-danger hover:bg-danger-faint' : 'text-ink hover:bg-surface-2'
    }`}
  >
    {children}
  </button>
);

const Sep = () => <span aria-hidden="true" className="mx-0.5 h-6 w-px shrink-0 bg-elevated" />;

/** Floating action dock: every edit on the selected pages, one tap away. */
export const OrganizeDock: React.FC<OrganizeDockProps> = ({ count, total, onRotate, onNudge, onDuplicate, onBlank, onDelete, disabled }) => {
  const none = disabled || count === 0;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
      <p
        role="status"
        aria-live="polite"
        className={`pointer-events-none rounded-full border border-primary/40 bg-primary-strong px-3 py-1 text-xs font-bold tabular-nums text-white shadow-lg transition-all duration-200 ${count > 0 ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
      >
        {count} of {total} selected
      </p>
      <div role="toolbar" aria-label="Page actions" className="pointer-events-auto flex max-w-full items-center gap-0.5 rounded-full border border-elevated bg-surface/95 p-1.5 shadow-2xl backdrop-blur-xl">
        <Btn label="Turn left" onClick={() => onRotate(-90)} disabled={none}>
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
        </Btn>
        <Btn label="Turn right" onClick={() => onRotate(90)} disabled={none}>
          <RotateCw className="h-5 w-5" aria-hidden="true" />
        </Btn>
        <Sep />
        <Btn label="Move earlier" onClick={() => onNudge(-1)} disabled={none}>
          <ArrowLeftToLine className="h-5 w-5" aria-hidden="true" />
        </Btn>
        <Btn label="Move later" onClick={() => onNudge(1)} disabled={none}>
          <ArrowRightToLine className="h-5 w-5" aria-hidden="true" />
        </Btn>
        <Sep />
        <Btn label="Duplicate" onClick={onDuplicate} disabled={none}>
          <Copy className="h-5 w-5" aria-hidden="true" />
        </Btn>
        <Btn label="Insert blank page" onClick={onBlank} disabled={disabled}>
          <FilePlus2 className="h-5 w-5" aria-hidden="true" />
        </Btn>
        <Sep />
        <Btn label="Delete" onClick={onDelete} disabled={none} danger>
          <Trash2 className="h-5 w-5" aria-hidden="true" />
        </Btn>
      </div>
    </div>
  );
};
