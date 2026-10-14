'use client';

import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { MAX_FILE_SIZE_MB, MAX_TOTAL_SIZE_MB } from '@/lib/services/UploadService';
import { PdfDropzone } from '@/components/ui/PdfDropzone';

interface UploadAreaProps {
  onFilesUpload: (files: File[]) => void;
  isProcessing: boolean;
  /** Collapse to a slim "add more" row once files are loaded. */
  compact?: boolean;
}

/** Dark-Notes→Print upload screen. Thin wrapper over the shared PdfDropzone. */
export const UploadArea: React.FC<UploadAreaProps> = ({ onFilesUpload, compact = false }) => (
  <PdfDropzone
    title="Drop your lecture PDFs here"
    description="or choose files from your phone or computer. Dark slides become white, ink-saving pages."
    ctaLabel="Select PDF Files"
    ariaLabel="Upload PDF files"
    multiple
    onFiles={onFilesUpload}
    compact={compact}
    compactLabel="Add more PDFs"
    compactHint="or drop them here"
    compactMeta={`${MAX_TOTAL_SIZE_MB} MB total · ${MAX_FILE_SIZE_MB} MB each`}
    footer={
      <>
        <span className="flex items-center gap-1.5 font-semibold text-success">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          100% Private On-Device
        </span>
        <span>Saves 80% Paper &amp; Ink</span>
        <span>Up to {MAX_TOTAL_SIZE_MB} MB total · {MAX_FILE_SIZE_MB} MB each</span>
      </>
    }
  />
);
