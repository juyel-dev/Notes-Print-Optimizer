'use client';

import React, { useRef, useState } from 'react';
import { AlertCircle, FileUp, ScanText, ShieldCheck, Target } from 'lucide-react';
import { MAX_FILE_SIZE_MB, PDF_DROPZONE_ACCEPT } from '@/lib/services/UploadService';
import type { CompressWorkflow } from '@/lib/compress/useCompressWorkflow';
import { PressIllustration } from './PressIllustration';
import { TargetPicker } from './TargetPicker';

const POINTS = [
  { icon: ScanText, title: 'Text stays sharp', text: 'Keep-text mode shrinks only the pictures inside, so words stay selectable.' },
  { icon: Target, title: 'Hits your size', text: 'Pick a limit like 1 MB and we choose the gentlest strength that fits.' },
  { icon: ShieldCheck, title: 'Never uploaded', text: 'Your PDF is compressed on this device. Nothing is sent anywhere.' },
] as const;

/** Compress PDF's own upload screen: a "press" hero, an optional target, then the drop. */
export const CompressUploadView: React.FC<{ workflow: CompressWorkflow }> = ({ workflow }) => {
  const { state } = workflow;
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

  const error = localError ?? state.error;

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-danger-deep/60 bg-danger-faint px-4 py-3 text-sm text-danger-soft">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <section
        aria-label="Upload a PDF to compress"
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
        className={`relative overflow-hidden rounded-[32px] border p-6 text-center transition-colors sm:p-9 ${dragging ? 'border-accent' : 'border-accent/25'}`}
        style={{
          background:
            'radial-gradient(120% 90% at 50% -10%, color-mix(in srgb, var(--color-accent) 22%, transparent), transparent 60%), linear-gradient(180deg, var(--color-surface), var(--color-bg))',
        }}
      >
        <PressIllustration className="mx-auto h-28 w-40 sm:h-32 sm:w-48" />
        <h2 className="mt-3 text-4xl font-black leading-none tracking-[-0.03em] text-ink sm:text-5xl" style={{ fontFamily: 'var(--font-display)' }}>
          Make it <span className="text-accent-soft">smaller.</span>
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-muted sm:text-base">
          Shrink a PDF to the size you need — scans, notes, forms — right on your device.
        </p>

        <div className="mx-auto mt-6 max-w-md text-left">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-ink-faint">Where is it going? <span className="font-medium normal-case tracking-normal">(optional)</span></p>
          <TargetPicker target={state.target} onChange={workflow.setTarget} compact />
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={PDF_DROPZONE_ACCEPT.input}
          className="sr-only"
          aria-label="Choose a PDF to compress"
          onChange={(e) => {
            if (e.target.files?.length) void take(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-7 inline-flex min-h-[56px] w-full max-w-md items-center justify-center gap-2.5 rounded-2xl bg-accent px-6 text-base font-extrabold text-bg shadow-lg shadow-accent/20 transition-[transform,filter] duration-150 hover:brightness-110 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft"
        >
          <FileUp className="h-5 w-5" aria-hidden="true" />
          Choose a PDF
        </button>
        <p className="mt-3 text-xs text-ink-faint">or drop it here · up to {MAX_FILE_SIZE_MB} MB · one file at a time</p>
      </section>

      <ul className="grid gap-2.5 sm:grid-cols-3">
        {POINTS.map((p) => (
          <li key={p.title} className="flex gap-3 rounded-2xl border border-surface-2 bg-surface/60 p-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-soft">
              <p.icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-ink">{p.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{p.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
