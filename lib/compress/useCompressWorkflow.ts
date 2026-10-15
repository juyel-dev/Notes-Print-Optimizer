/**
 * useCompressWorkflow — drives Compress PDF: read file → analyze → predict
 * sizes → compress (with target-size retry) → download.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { isLikelyPdfFile, UploadService } from '@/lib/services/UploadService';
import { ExportService } from '@/lib/services/ExportService';
import { sanitizeBaseName } from '@/lib/shared/filename';
import { CompressSession } from './compressService';
import { compressReducer, INITIAL_COMPRESS_STATE } from './compressReducer';
import type { CompressLevel, CompressMode } from './types';

/** Extra strength steps tried automatically when the real output misses the target. */
const MAX_TARGET_RETRIES = 2;

const isCancel = (err: unknown) => err instanceof Error && err.message === 'Processing cancelled.';
const msgOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export function useCompressWorkflow() {
  const [state, dispatch] = useReducer(compressReducer, INITIAL_COMPRESS_STATE);
  const sessionRef = useRef<CompressSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      sessionRef.current?.dispose();
    },
    [],
  );

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    sessionRef.current?.dispose();
    sessionRef.current = null;
    dispatch({ type: 'RESET' });
  }, []);

  const handleUpload = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (!(await isLikelyPdfFile(file))) {
        dispatch({ type: 'ERROR', step: 'upload', error: `"${file.name}" is not a PDF file.` });
        return;
      }
      const [item] = await UploadService.readFiles([file]);
      const bytes = new Uint8Array(item.arrayBuffer.slice(0));
      dispatch({ type: 'ANALYZE_START', source: { name: item.name, baseName: item.name.replace(/\.pdf$/i, ''), size: bytes.length } });
      sessionRef.current?.dispose();
      const session = await CompressSession.open(item.name, bytes, controller.signal);
      if (controller.signal.aborted) return;
      sessionRef.current = session;
      dispatch({ type: 'ANALYZE_DONE', analysis: session.analysis });
    } catch (err) {
      if (isCancel(err)) return;
      dispatch({ type: 'ERROR', step: 'upload', error: msgOf(err, 'Could not read that file.') });
    }
  }, []);

  // Predict sizes for the active mode once per file (cached per mode in state).
  const wantMode: CompressMode | null = state.step === 'studio' && state.estimates[state.mode] === undefined ? state.mode : null;
  useEffect(() => {
    const session = sessionRef.current;
    if (!wantMode || !session || state.estimating) return;
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: 'ESTIMATE_START', mode: wantMode });
    session
      .estimate(wantMode, (p) => dispatch({ type: 'ESTIMATE_PROGRESS', done: p.done, total: p.total }), controller.signal)
      .then((sizes) => {
        if (!controller.signal.aborted) dispatch({ type: 'ESTIMATE_DONE', mode: wantMode, sizes });
      })
      .catch((err) => {
        if (isCancel(err)) return;
        dispatch({ type: 'ESTIMATE_FAIL', error: msgOf(err, 'Could not estimate the new size.') });
      });
    return () => controller.abort();
    // state.estimating is deliberately read once at start; wantMode changing re-runs this effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantMode]);

  const handleRun = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || state.step !== 'studio') return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { mode, target } = state;
    let level: CompressLevel = state.level;
    dispatch({ type: 'RUN_START' });

    try {
      let attempts = 0;
      for (;;) {
        attempts++;
        const outcome = await session.run(
          mode,
          level,
          (p) =>
            dispatch({
              type: 'RUN_PROGRESS',
              progress: {
                pct: Math.min(98, Math.round(((attempts - 1) / (MAX_TARGET_RETRIES + 1)) * 100 + (p.done / Math.max(1, p.total)) * (100 / (MAX_TARGET_RETRIES + 1)))),
                label: attempts > 1 ? `${p.label} · tighter pass ${attempts - 1}` : p.label,
              },
            }),
          controller.signal,
        );
        const missed = target !== null && !outcome.unchanged && outcome.size > target;
        if (missed && level < 5 && attempts <= MAX_TARGET_RETRIES) {
          level = (level + 1) as CompressLevel;
          continue;
        }
        dispatch({
          type: 'RUN_DONE',
          result: {
            blob: new Blob([outcome.bytes as unknown as BlobPart], { type: 'application/pdf' }),
            size: outcome.size,
            mode,
            level: outcome.level,
            unchanged: outcome.unchanged,
            target,
            reachedTarget: target === null ? null : outcome.size <= target,
            attempts,
          },
        });
        return;
      }
    } catch (err) {
      if (isCancel(err)) {
        dispatch({ type: 'RUN_CANCEL' });
        return;
      }
      dispatch({ type: 'ERROR', step: 'studio', error: msgOf(err, 'Compression failed. The PDF may be damaged.') });
    }
  }, [state]);

  const handleCancel = useCallback(() => abortRef.current?.abort(), []);

  const handleDownload = useCallback(
    (baseName: string) => {
      if (!state.result) return;
      const clean = sanitizeBaseName(baseName) || 'Compressed';
      ExportService.downloadBlob(state.result.blob, `${clean}-compressed.pdf`);
    },
    [state.result],
  );

  return {
    state,
    originalBytes: () => sessionRef.current?.bytes ?? null,
    handleUpload,
    handleReset,
    handleRun,
    handleCancel,
    handleDownload,
    setMode: (mode: CompressMode) => dispatch({ type: 'SET_MODE', mode }),
    setLevel: (level: CompressLevel) => dispatch({ type: 'SET_LEVEL', level }),
    setTarget: (target: number | null) => dispatch({ type: 'SET_TARGET', target }),
    backToStudio: () => dispatch({ type: 'BACK_TO_STUDIO' }),
  };
}

export type CompressWorkflow = ReturnType<typeof useCompressWorkflow>;
