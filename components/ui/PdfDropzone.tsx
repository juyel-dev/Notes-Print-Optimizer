'use client';

import React, { useRef, useState } from 'react';
import { AlertCircle, FileUp, Plus } from 'lucide-react';
import { MAX_FILE_SIZE_MB, PDF_DROPZONE_ACCEPT, type DropzoneAccept } from '@/lib/services/UploadService';

export interface PdfDropzoneProps {
  title: string;
  description: string;
  ctaLabel?: string;
  ariaLabel?: string;
  multiple?: boolean;
  /** Omit for no file-count cap. */
  maxFiles?: number;
  minHeights?: string;
  /** What this zone accepts — defaults to PDFs for the classic tools. */
  accept?: DropzoneAccept;
  onFiles: (files: File[]) => void;
  footer?: React.ReactNode;
  /** Slim "add more" row for screens that already hold files. */
  compact?: boolean;
  compactLabel?: string;
  compactHint?: string;
  compactMeta?: string;
}

interface SkippedSummary {
  count: number;
  list: string;
}

function formatSkipped(skipped: string[]): SkippedSummary | null {
  if (skipped.length === 0) return null;
  return {
    count: skipped.length,
    list: skipped.slice(0, 3).join(', ') + (skipped.length > 3 ? ` +${skipped.length - 3} more` : ''),
  };
}

/** The one upload zone — drag/drop/tap/keyboard, shared PDF validation.
 *  Replaces the cloned UploadArea + EnhanceUploadView cores. */
export const PdfDropzone: React.FC<PdfDropzoneProps> = ({
  title,
  description,
  ctaLabel = 'Select PDF Files',
  ariaLabel = 'Upload PDF files',
  multiple = true,
  maxFiles,
  minHeights = 'min-h-[240px] lg:min-h-[280px]',
  accept = PDF_DROPZONE_ACCEPT,
  onFiles,
  footer,
  compact = false,
  compactLabel = 'Add more files',
  compactHint = 'or drop them here',
  compactMeta,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFileList = async (filesList: FileList | File[]) => {
    setUploadError(null);
    const files = Array.from(filesList as FileList);
    // Files have been copied out of the FileList; clear it before validation so
    // selecting the same rejected file a second time can trigger onChange again.
    if (fileInputRef.current) fileInputRef.current.value = '';
    const { validFiles, skipped, error } = await accept.validate(files, maxFiles ?? Number.MAX_SAFE_INTEGER);

    if (error) {
      setUploadError(error);
      return;
    }

    if (validFiles.length > 0) {
      onFiles(validFiles);
    }

    const summary = formatSkipped(skipped);
    if (summary) {
      setUploadError(
        `Skipped ${summary.count} file(s): ${summary.list} — only supported ${accept.noun} up to ${MAX_FILE_SIZE_MB} MB are accepted.`,
      );
    } else if (validFiles.length === 0) {
      setUploadError(`No supported ${accept.noun} found — up to ${MAX_FILE_SIZE_MB} MB each.`);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        // The compact zone has no inner control, so the zone itself is the button.
        // The full-size zone already contains a real "choose" button; making the
        // wrapper a button too would nest interactive controls (invalid ARIA).
        role={compact ? 'button' : undefined}
        tabIndex={compact ? 0 : undefined}
        onKeyDown={
          compact
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }
            : undefined
        }
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files.length > 0) void processFileList(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`group relative flex cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft ${
          compact
            ? 'min-h-16 flex-row items-center justify-between gap-4 px-5 py-3 text-left'
            : `flex-col items-center justify-center p-8 text-center lg:p-12 ${minHeights}`
        } ${
          isDragging
            ? 'border-solid border-primary bg-primary-faint/40'
            : 'border-elevated bg-surface hover:border-primary/70'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept.input}
          multiple={multiple}
          aria-label={ariaLabel}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) void processFileList(e.target.files);
          }}
          className="hidden"
        />

        {compact ? (
          <>
            <span className="flex min-w-0 items-center gap-3 text-[15px] font-semibold text-ink">
              <Plus className="h-5 w-5 shrink-0 text-primary-soft" aria-hidden="true" />
              <span className="truncate">{compactLabel}</span>
              <span className="hidden font-medium text-ink-muted sm:inline">{compactHint}</span>
            </span>
            {compactMeta && (
              <span className="hidden shrink-0 font-mono text-xs text-ink-faint md:inline">{compactMeta}</span>
            )}
          </>
        ) : (
          <>
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary-faint text-primary-soft transition-colors duration-200 group-hover:text-ink">
              <FileUp className="h-8 w-8" aria-hidden="true" />
            </div>

            <div className="relative mt-5 flex flex-col items-center gap-2">
              <h2
                className="text-xl font-bold tracking-[-0.015em] text-ink lg:text-2xl"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {title}
              </h2>
              <p className="max-w-sm text-sm leading-relaxed text-ink-muted lg:max-w-md lg:text-base">{description}</p>
            </div>

            {/* Real button (not a decorative span) — stops click bubbling to the zone */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="relative mt-6 inline-flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] bg-primary-strong px-7 text-base font-bold text-white transition-[background-color,transform] duration-150 hover:bg-primary-deep active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft"
            >
              {ctaLabel}
            </button>

            {footer && (
              <div className="relative mt-7 flex w-full flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-surface-2 pt-5 text-sm text-ink-muted">
                {footer}
              </div>
            )}
          </>
        )}
      </div>

      {uploadError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger-deep/60 bg-danger-faint px-4 py-3 text-xs text-danger-soft"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <span>{uploadError}</span>
        </div>
      )}
    </div>
  );
};