'use client';

import React, { useRef, useState } from 'react';
import { AlertCircle, Copy, FileUp, RotateCw, ScanSearch, Trash2, GripVertical } from 'lucide-react';
import { MAX_FILE_SIZE_MB, PDF_DROPZONE_ACCEPT } from '@/lib/services/UploadService';
import { MAX_ORGANIZE_PAGES } from '@/lib/organize/types';
import type { OrganizeWorkflow } from '@/lib/organize/useOrganizeWorkflow';
import { FanIllustration } from './FanIllustration';

const CAPS = [
  { icon: GripVertical, label: 'Reorder' },
  { icon: RotateCw, label: 'Turn' },
  { icon: Trash2, label: 'Delete' },
  { icon: Copy, label: 'Duplicate' },
  { icon: ScanSearch, label: 'Find blanks' },
] as const;

/** Organize Pages upload: sheets on a dotted table and an inverted "ink" call to action. */
export const OrganizeUploadView: React.FC<{ workflow: OrganizeWorkflow }> = ({ workflow }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const take = async (list: FileList | File[]) => {
    setLocalError(null);
    const { validFiles, skipped, error } = await PDF_DROPZONE_ACCEPT.validate(Array.from(list as FileList), 1);
    if (error) return setLocalError(error);
    if (validFiles.length === 0) {
      return setLocalError(skipped.length ? `That file can’t be used — PDFs up to ${MAX_FILE_SIZE_MB} MB only.` : 'Please choose a PDF file.');
    }
    void workflow.handleUpload(validFiles.slice(0, 1));
  };

  const error = localError ?? workflow.state.error;

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-danger-deep/60 bg-danger-faint px-4 py-3 text-sm text-danger-soft">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      <section
        aria-label="Upload a PDF to organize"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) void take(e.dataTransfer.files);
        }}
        className={`overflow-hidden rounded-[32px] border p-6 text-center transition-colors sm:p-10 ${dragging ? 'border-primary-soft' : 'border-surface-2'}`}
        style={{
          backgroundColor: 'var(--color-surface)',
          backgroundImage: 'radial-gradient(color-mix(in srgb, var(--color-ink) 16%, transparent) 1px, transparent 1.3px)',
          backgroundSize: '18px 18px',
        }}
      >
        <FanIllustration className="mx-auto h-32 w-48 sm:h-36 sm:w-56" />
        <h2 className="mt-4 text-4xl font-black leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl" style={{ fontFamily: 'var(--font-display)' }}>
          Put your pages
          <br />
          in order.
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-muted sm:text-base">
          Turn sideways scans, drop blank sheets, reshuffle — then export a clean PDF. Nothing leaves your device.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={PDF_DROPZONE_ACCEPT.input}
          className="sr-only"
          aria-label="Choose a PDF to organize"
          onChange={(e) => {
            if (e.target.files?.length) void take(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-7 inline-flex min-h-[56px] w-full max-w-sm items-center justify-center gap-2.5 rounded-full bg-ink px-6 text-base font-extrabold text-bg shadow-xl transition-transform duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft"
        >
          <FileUp className="h-5 w-5" aria-hidden="true" />
          Choose a PDF
        </button>
        <p className="mt-3 text-xs text-ink-faint">
          or drop it here · up to {MAX_FILE_SIZE_MB} MB · {MAX_ORGANIZE_PAGES} pages
        </p>
      </section>

      <ul className="flex flex-wrap justify-center gap-2" aria-label="What you can do">
        {CAPS.map((c) => (
          <li key={c.label} className="flex items-center gap-2 rounded-full border border-surface-2 bg-surface/70 px-3.5 py-2 text-xs font-bold text-ink-muted">
            <c.icon className="h-3.5 w-3.5 text-primary-soft" aria-hidden="true" />
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
};
