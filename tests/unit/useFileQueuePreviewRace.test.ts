import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UploadService, type UploadedItem } from '../../lib/services/UploadService';
import { memoryManager } from '../../lib/optimizer/memoryManager';
import { useFileQueue } from '../../lib/workflow/hooks/useFileQueue';
import type { WorkflowActions } from '../../lib/workflow/useWorkflow';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useFileQueue merged preview ordering', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores a slower stale preview and revokes its thumbnails', async () => {
    type Preview = Awaited<ReturnType<typeof UploadService.mergeAndPreview>>;
    const first = deferred<Preview>();
    const second = deferred<Preview>();
    const mergeSpy = vi.spyOn(UploadService, 'mergeAndPreview')
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const revokeSpy = vi.spyOn(memoryManager, 'revokeBlobUrl').mockImplementation(() => {});
    const actions = {
      setUploadedItems: vi.fn(),
      setMergeResult: vi.fn(),
    } as unknown as WorkflowActions;

    const items = [
      { id: 'first', name: 'first.pdf' },
      { id: 'second', name: 'second.pdf' },
    ] as UploadedItem[];
    let queue!: ReturnType<typeof useFileQueue>;
    const host = document.createElement('div');
    const root = createRoot(host);

    function Harness() {
      queue = useFileQueue({
        uploadedItems: items,
        mergedPdfBlob: null,
        mergedPageDataUrls: [],
        actions,
        withProcessing: vi.fn() as never,
        clearProgressiveThumbnails: vi.fn(),
      });
      return null;
    }

    const preview = (n: number, url: string): NonNullable<Preview> => ({
      pdfBlob: new Blob([String(n)], { type: 'application/pdf' }),
      pdfBytes: new Uint8Array([n]),
      thumbnails: [url],
    });

    try {
      await act(async () => {
        root.render(React.createElement(Harness));
      });

      const olderRequest = queue.handleMoveItem(0, 'DOWN');
      const newerRequest = queue.handleMoveItem(0, 'DOWN');

      second.resolve(preview(2, 'blob:newer-preview'));
      await act(async () => { await newerRequest; });

      first.resolve(preview(1, 'blob:stale-preview'));
      await act(async () => { await olderRequest; });

      expect(mergeSpy).toHaveBeenCalledTimes(2);
      expect(actions.setMergeResult).toHaveBeenCalledTimes(1);
      expect(actions.setMergeResult).toHaveBeenCalledWith(
        expect.any(Blob),
        new Uint8Array([2]),
        ['blob:newer-preview'],
      );
      expect(revokeSpy).toHaveBeenCalledWith('blob:stale-preview');
    } finally {
      await act(async () => { root.unmount(); });
    }
  });
});
