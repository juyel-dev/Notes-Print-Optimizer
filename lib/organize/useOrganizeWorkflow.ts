/**
 * useOrganizeWorkflow — drives Organize Pages: read file → thumbnails → edit
 * (undo/redo) → find blanks → export.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { isLikelyPdfFile, UploadService } from '@/lib/services/UploadService';
import { ExportService } from '@/lib/services/ExportService';
import { sanitizeBaseName } from '@/lib/shared/filename';
import { friendlyOpenError } from '@/lib/compress/analyze';
import { organizeReducer, INITIAL_ORGANIZE_STATE } from './organizeReducer';
import { buildOrganizedPdf, readPageMetas } from './organizeExport';
import { selectedInOrder } from './pageOps';
import { isNearlyBlank } from './blank';
import { PageThumbnails } from './thumbnails';
import { MAX_ORGANIZE_PAGES } from './types';

const msgOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export function useOrganizeWorkflow() {
  const [state, dispatch] = useReducer(organizeReducer, INITIAL_ORGANIZE_STATE);
  const [thumbVersion, setThumbVersion] = useState(0);
  const bytesRef = useRef<Uint8Array | null>(null);
  const thumbsRef = useRef<PageThumbnails | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const frameRef = useRef<number | null>(null);
  const scanAbort = useRef<AbortController | null>(null);

  const teardown = useCallback(() => {
    scanAbort.current?.abort();
    unsubRef.current?.();
    unsubRef.current = null;
    thumbsRef.current?.dispose();
    thumbsRef.current = null;
    bytesRef.current = null;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const handleReset = useCallback(() => {
    teardown();
    dispatch({ type: 'RESET' });
  }, [teardown]);

  const handleUpload = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      try {
        if (!(await isLikelyPdfFile(file))) {
          dispatch({ type: 'ERROR', step: 'upload', error: `"${file.name}" is not a PDF file.` });
          return;
        }
        const [item] = await UploadService.readFiles([file]);
        const bytes = new Uint8Array(item.arrayBuffer.slice(0));
        teardown();
        dispatch({ type: 'LOAD_START', source: { name: item.name, baseName: item.name.replace(/\.pdf$/i, ''), size: bytes.length } });
        let loaded;
        try {
          loaded = await readPageMetas(bytes);
        } catch (err) {
          throw friendlyOpenError(err, item.name);
        }
        if (loaded.pageCount === 0) throw new Error(`"${item.name}" has no pages.`);
        if (loaded.pageCount > MAX_ORGANIZE_PAGES) {
          throw new Error(`"${item.name}" has ${loaded.pageCount} pages. Organize Pages handles up to ${MAX_ORGANIZE_PAGES} — split it first.`);
        }
        bytesRef.current = bytes;
        const thumbs = new PageThumbnails(bytes);
        thumbsRef.current = thumbs;
        unsubRef.current = thumbs.subscribe(() => {
          if (frameRef.current !== null) return; // batch bursts into one render per frame
          frameRef.current = requestAnimationFrame(() => {
            frameRef.current = null;
            setThumbVersion((v) => v + 1);
          });
        });
        dispatch({ type: 'LOAD_DONE', pageCount: loaded.pageCount, metas: loaded.metas });
      } catch (err) {
        dispatch({ type: 'ERROR', step: 'upload', error: msgOf(err, 'Could not read that file.') });
      }
    },
    [teardown],
  );

  const requestThumb = useCallback((index: number) => {
    void thumbsRef.current?.request(index, true);
  }, []);

  const getThumb = useCallback((index: number) => thumbsRef.current?.get(index), []);

  /** Renders every page, measures ink, then selects the nearly blank ones. */
  const handleFindBlanks = useCallback(async () => {
    const thumbs = thumbsRef.current;
    const count = state.source?.pageCount ?? 0;
    if (!thumbs || count === 0 || state.blankScan) return;
    scanAbort.current?.abort();
    const controller = new AbortController();
    scanAbort.current = controller;
    dispatch({ type: 'BLANK_SCAN_PROGRESS', done: 0, total: count });
    try {
      await thumbs.requestAll(count, (done, total) => dispatch({ type: 'BLANK_SCAN_PROGRESS', done, total }), controller.signal);
      if (controller.signal.aborted) return;
      const blankSrc = new Set<number>();
      for (let i = 0; i < count; i++) {
        const t = thumbs.get(i);
        if (t && isNearlyBlank(t.ink)) blankSrc.add(i);
      }
      dispatch({ type: 'BLANK_SCAN_DONE', ids: state.items.filter((p) => p.src !== null && blankSrc.has(p.src)).map((p) => p.id) });
    } catch {
      dispatch({ type: 'BLANK_SCAN_FAIL' });
    }
  }, [state.source, state.items, state.blankScan]);

  const handleExport = useCallback(
    async (selectionOnly: boolean) => {
      const bytes = bytesRef.current;
      if (!bytes) return;
      const sel = new Set(state.selected);
      const items = selectionOnly ? selectedInOrder(state.items, sel) : state.items;
      if (items.length === 0) return;
      dispatch({ type: 'EXPORT_START' });
      try {
        const out = await buildOrganizedPdf(bytes, items);
        dispatch({
          type: 'EXPORT_DONE',
          result: { blob: new Blob([out as unknown as BlobPart], { type: 'application/pdf' }), size: out.length, pages: items.length, selectionOnly },
        });
      } catch (err) {
        dispatch({ type: 'EXPORT_FAIL', error: msgOf(err, 'Could not build the PDF. The file may be damaged.') });
      }
    },
    [state.items, state.selected],
  );

  const handleDownload = useCallback(
    (baseName: string) => {
      if (!state.result) return;
      const clean = sanitizeBaseName(baseName) || 'Organized';
      ExportService.downloadBlob(state.result.blob, `${clean}-organized.pdf`);
    },
    [state.result],
  );

  return {
    state,
    thumbVersion,
    getThumb,
    requestThumb,
    handleUpload,
    handleReset,
    handleFindBlanks,
    handleExport,
    handleDownload,
    dispatch,
  };
}

export type OrganizeWorkflow = ReturnType<typeof useOrganizeWorkflow>;
