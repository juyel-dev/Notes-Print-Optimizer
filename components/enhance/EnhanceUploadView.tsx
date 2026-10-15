'use client';

import React from 'react';
import { AlertCircle, Lightbulb, Printer, ShieldCheck, SlidersHorizontal, Sun } from 'lucide-react';
import { MAX_FILE_SIZE_MB } from '@/lib/services/UploadService';
import { PdfDropzone } from '@/components/ui/PdfDropzone';
import { MAX_ENHANCE_FILES } from '@/lib/enhance/types';
import type { EnhanceWorkflow } from '@/lib/enhance/useEnhanceWorkflow';

const HOW = [
  { icon: Sun, title: 'Upload', text: 'Faint scans or phone photos of notes' },
  { icon: SlidersHorizontal, title: 'Tune', text: 'Pick a preset, watch the live preview' },
  { icon: Printer, title: 'Print', text: 'Download a dark, clean, print-ready PDF' },
] as const;

/** Enhance Light PDF upload screen: shared dropzone + a short "how it works" and capture tips. */
export const EnhanceUploadView: React.FC<{ workflow: EnhanceWorkflow }> = ({ workflow }) => (
  <div className="flex flex-col gap-4">
    {workflow.state.error && (
      <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger-deep/60 bg-danger-faint px-4 py-3 text-sm text-danger-soft">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
        <span>{workflow.state.error}</span>
      </div>
    )}
    <PdfDropzone
      title="Upload Faint PDFs"
      description="Tap to choose scanned or photographed notes — light ink, gray paper and camera shadows get fixed for print."
      ctaLabel="Select PDF Files"
      ariaLabel="Upload PDF files to enhance"
      multiple
      maxFiles={MAX_ENHANCE_FILES}
      minHeights="min-h-[260px]"
      onFiles={(files) => workflow.handleUpload(files)}
      footer={
        <>
          <span className="flex items-center gap-1 font-semibold text-success">
            <ShieldCheck className="h-3.5 w-3.5" />
            100% Private On-Device
          </span>
          <span aria-hidden="true" className="hidden text-ink-faint sm:inline">•</span>
          <span>Up to {MAX_ENHANCE_FILES} PDFs · {MAX_FILE_SIZE_MB} MB each</span>
        </>
      }
    />

    <ol aria-label="How it works" className="grid grid-cols-3 gap-2">
      {HOW.map((h, i) => (
        <li key={h.title} className="flex flex-col items-center gap-1.5 rounded-xl border border-surface-2 bg-surface/70 px-2 py-3 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/30 bg-primary-faint text-primary-soft">
            <h.icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-xs font-bold text-ink">
            {i + 1}. {h.title}
          </span>
          <span className="text-2xs leading-snug text-ink-muted">{h.text}</span>
        </li>
      ))}
    </ol>

    <aside className="flex gap-3 rounded-xl border border-surface-2 bg-surface/60 p-3.5">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent-soft" aria-hidden="true" />
      <p className="text-xs leading-relaxed text-ink-muted">
        <span className="font-bold text-ink">Better scans, better prints:</span> lay the page flat, use even daylight, and avoid your own shadow. Anything uneven is
        cleaned up automatically, but a sharp photo always prints sharper.
      </p>
    </aside>
  </div>
);
