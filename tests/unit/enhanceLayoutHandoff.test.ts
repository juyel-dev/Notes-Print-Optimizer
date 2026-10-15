/**
 * Hook-level tests for the Enhance -> Layout handoff session flow:
 * cache-clear ordering (no wipe-after-write race) and phase publication.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pwOptimizerStorage } from '@/lib/optimizer/storage';
import { useSessionFlow } from '@/lib/workflow/hooks/useSessionFlow';
import type { WorkflowActions } from '@/lib/workflow/useWorkflow';
import type { HandoffPageInput } from '@/lib/services/EnhanceHandoffService';

vi.mock('@/lib/optimizer/storage', () => ({
  pwOptimizerStorage: {
    storePagesBatch: vi.fn().mockResolvedValue(undefined),
    clearCache: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/optimizer/memoryManager', () => ({
  memoryManager: { revokeAllBlobUrls: vi.fn() },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const page = (n: number): HandoffPageInput => ({
  dataUrl: `data:image/jpeg;base64,${btoa(`handoff-${n}`)}`,
  width: 800 + n,
  height: 1000 + n,
});

function setup() {
  const actions = {
    setProcessing: vi.fn(),
    setProgress: vi.fn(),
    setError: vi.fn(),
    setPhase: vi.fn(),
    setProcessedPages: vi.fn(),
    resetWorkflow: vi.fn(),
  } as unknown as WorkflowActions & {
    setPhase: ReturnType<typeof vi.fn>;
    setProcessedPages: ReturnType<typeof vi.fn>;
  };
  let session!: ReturnType<typeof useSessionFlow>;
  const host = document.createElement('div');
  const root = createRoot(host);

  function Harness() {
    session = useSessionFlow({
      actions,
      abortRef: { current: null } as React.MutableRefObject<AbortController | null>,
      revokePreviewAssets: vi.fn(),
      clearProgressiveThumbnails: vi.fn(),
      withProcessing: vi.fn() as never,
      finalPrintPdfBlob: null,
      optimized1UpBlob: null,
      processedPages: [],
      rating: 0,
      feedbackText: '',
    });
    return null;
  }

  return { actions, host, root, Harness, getSession: () => session };
}

describe('useSessionFlow.handleEnhanceLayoutHandoff', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(pwOptimizerStorage.storePagesBatch).mockResolvedValue(undefined);
    vi.mocked(pwOptimizerStorage.clearCache).mockResolvedValue(undefined);
  });

  it('clears the cache BEFORE persisting handoff pages, then publishes phase 3', async () => {
    const order: string[] = [];
    const gate = deferred<void>();
    vi.mocked(pwOptimizerStorage.clearCache).mockImplementation(async () => {
      order.push('clear');
      await gate.promise;
    });
    vi.mocked(pwOptimizerStorage.storePagesBatch).mockImplementation(async () => {
      order.push('persist');
    });

    const { actions, root, Harness, getSession } = setup();
    try {
      await act(async () => {
        root.render(React.createElement(Harness));
      });

      let done!: Promise<void>;
      await act(async () => {
        done = getSession().handleEnhanceLayoutHandoff([page(0), page(1)]);
      });

      // Two clears fire synchronously (the reset's fire-and-forget one plus
      // the handoff's awaited one) — both are still in flight, so the write
      // must wait for them.
      expect(order).toEqual(['clear', 'clear']);
      expect(pwOptimizerStorage.clearCache).toHaveBeenCalledTimes(2);
      expect(pwOptimizerStorage.storePagesBatch).not.toHaveBeenCalled();

      await act(async () => {
        gate.resolve();
        await done;
      });

      expect(order).toEqual(['clear', 'clear', 'persist']);
      expect(actions.setPhase).toHaveBeenCalledWith(3);
      expect(actions.setProcessedPages).toHaveBeenCalledTimes(1);

      // Published manifest must point at exactly what was persisted.
      const [records] = vi.mocked(pwOptimizerStorage.storePagesBatch).mock.calls[0];
      const [published] = (actions.setProcessedPages as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(published).toHaveLength(2);
      expect(published[0].storageKey).toBe(records[0].pdfId);
      expect(published[1].pageIndex).toBe(1);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('does nothing for an empty handoff', async () => {
    const { actions, root, Harness, getSession } = setup();
    try {
      await act(async () => {
        root.render(React.createElement(Harness));
      });
      await act(async () => {
        await getSession().handleEnhanceLayoutHandoff([]);
      });
      expect(pwOptimizerStorage.clearCache).not.toHaveBeenCalled();
      expect(pwOptimizerStorage.storePagesBatch).not.toHaveBeenCalled();
      expect(actions.setPhase).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
});
