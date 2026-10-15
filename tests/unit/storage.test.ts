import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pwOptimizerStorage } from '../../lib/optimizer/storage';

type StorageInternals = {
  dbPromise: Promise<IDBDatabase> | null;
  cachedSizeBytes: number | null;
  getDB: () => Promise<IDBDatabase>;
};

const MB = 1024 * 1024;

function seededRecord(pdfId: string, pageIndex: number, timestamp: number, sizeBytes: number) {
  return {
    id: `${pdfId}_page_${pageIndex}`,
    pdfId,
    pageIndex,
    optimizedBlob: new Blob(['seed']),
    timestamp,
    cacheVersion: 2,
    sizeBytes,
  };
}

async function seedCacheRecords(records: ReturnType<typeof seededRecord>[]): Promise<void> {
  const internals = pwOptimizerStorage as unknown as StorageInternals;
  const db = await internals.getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('pages_cache', 'readwrite');
    const store = tx.objectStore('pages_cache');
    records.forEach((record) => store.put(record));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  internals.cachedSizeBytes = null;
}

function blobWithReportedSize(sizeBytes: number): Blob {
  const blob = new Blob(['small test body']);
  // The cache ledger is seeded with virtual byte sizes so we can exercise the
  // 200 MiB eviction threshold without allocating hundreds of MiB in a test.
  Object.defineProperty(blob, 'size', { configurable: true, value: sizeBytes });
  return blob;
}

describe('PWOptimizerStorage', () => {
  beforeEach(() => {
    const storage = pwOptimizerStorage as unknown as StorageInternals;
    storage.dbPromise = null;
    storage.cachedSizeBytes = null;
  });

  afterEach(async () => {
    const storage = pwOptimizerStorage as unknown as StorageInternals;
    if (storage.dbPromise) {
      try {
        const db = await storage.dbPromise;
        if (db && typeof db.close === 'function') {
          db.close();
        }
      } catch {}
      storage.dbPromise = null;
    }
    storage.cachedSizeBytes = null;
    
    const req = indexedDB.deleteDatabase('pw_optimizer_cache_db');
    await new Promise((resolve) => {
      req.onsuccess = resolve;
      req.onerror = resolve;
      req.onblocked = resolve;
    });
  });

  it('should store and retrieve a page successfully', async () => {
    const pdfId = 'test-pdf-123';
    const pageIndex = 0;
    const originalBlob = new Blob(['original data'], { type: 'image/png' });
    const optimizedBlob = new Blob(['optimized data'], { type: 'image/jpeg' });

    await pwOptimizerStorage.storePage(pdfId, pageIndex, originalBlob, optimizedBlob);
    const record = await pwOptimizerStorage.getPage(pdfId, pageIndex);
    
    expect(record).not.toBeNull();
    expect(record!.originalBlob).toBeDefined();
    expect(record!.optimizedBlob).toBeDefined();
    // fake-indexeddb may drop properties when cloning jsdom Blobs, handle gracefully
    if (record!.originalBlob && record!.originalBlob.size !== undefined) {
      expect(record!.originalBlob.size).toBe(13);
      expect(record!.optimizedBlob.size).toBe(14);
    }
  });

  it('propagates batch persistence failures so callers cannot report success with missing pages', async () => {
    const storage = pwOptimizerStorage as unknown as {
      getDB: () => Promise<IDBDatabase>;
    };
    const getDB = vi.spyOn(storage, 'getDB').mockRejectedValue(new Error('IndexedDB unavailable'));

    try {
      await expect(
        pwOptimizerStorage.storePagesBatch([
          { pdfId: 'failed-write', pageIndex: 0, originalBlob: null, optimizedBlob: new Blob(['page']) },
        ]),
      ).rejects.toThrow('IndexedDB unavailable');
    } finally {
      getDB.mockRestore();
    }
  });

  it('retries IndexedDB open after a transient opening error', async () => {
    const open = vi.spyOn(indexedDB, 'open');
    open.mockImplementationOnce(() => {
      throw new Error('Temporary IndexedDB open failure');
    });

    try {
      // First read is best-effort and returns the current empty size, but the
      // failed promise must be cleared so the next write can open the database.
      expect(await pwOptimizerStorage.getCacheSize()).toBe(0);
      await pwOptimizerStorage.storePage('retry-db', 0, null, new Blob(['saved']));
      expect(await pwOptimizerStorage.getPage('retry-db', 0)).not.toBeNull();
    } finally {
      open.mockRestore();
    }
  });

  it('does not evict a record that is being replaced during single-page cache eviction', async () => {
    await seedCacheRecords([
      seededRecord('target', 0, 1, 100 * MB),
      seededRecord('evict-me', 0, 2, 100 * MB),
    ]);
    expect(await pwOptimizerStorage.getCacheSize()).toBe(200 * MB);

    await pwOptimizerStorage.storePage('target', 0, null, blobWithReportedSize(120 * MB));

    // Force a DB recount instead of trusting the in-memory mirror. Before the
    // fix the target row could be deleted first, then re-created, leaving both
    // pages in IndexedDB while the cached-size mirror claimed only 120 MiB.
    const internals = pwOptimizerStorage as unknown as StorageInternals;
    internals.cachedSizeBytes = null;
    expect(await pwOptimizerStorage.getCacheSize()).toBe(120 * MB);
    expect(await pwOptimizerStorage.getPage('target', 0)).not.toBeNull();
    expect(await pwOptimizerStorage.getPage('evict-me', 0)).toBeNull();
  });

  it('protects every row in a batch replacement from the eviction cursor', async () => {
    await seedCacheRecords([
      seededRecord('keep-a', 0, 1, 50 * MB),
      seededRecord('keep-b', 0, 2, 50 * MB),
      seededRecord('evict-me', 0, 3, 100 * MB),
    ]);
    expect(await pwOptimizerStorage.getCacheSize()).toBe(200 * MB);

    await pwOptimizerStorage.storePagesBatch([
      { pdfId: 'keep-a', pageIndex: 0, originalBlob: null, optimizedBlob: blobWithReportedSize(60 * MB) },
      { pdfId: 'keep-b', pageIndex: 0, originalBlob: null, optimizedBlob: blobWithReportedSize(60 * MB) },
    ]);

    const internals = pwOptimizerStorage as unknown as StorageInternals;
    internals.cachedSizeBytes = null;
    expect(await pwOptimizerStorage.getCacheSize()).toBe(120 * MB);
    expect(await pwOptimizerStorage.getPage('keep-a', 0)).not.toBeNull();
    expect(await pwOptimizerStorage.getPage('keep-b', 0)).not.toBeNull();
    expect(await pwOptimizerStorage.getPage('evict-me', 0)).toBeNull();
  });

  it('uses net batch growth for eviction when some updated pages shrink', async () => {
    await seedCacheRecords([
      seededRecord('shrink-page', 0, 1, 100 * MB),
      seededRecord('grow-page', 0, 2, 50 * MB),
      seededRecord('unrelated-page', 0, 3, 50 * MB),
    ]);
    expect(await pwOptimizerStorage.getCacheSize()).toBe(200 * MB);

    // One row shrinks by 50 MiB while another grows by 50 MiB. The batch's
    // final cache size is unchanged, so no unrelated page should be evicted.
    await pwOptimizerStorage.storePagesBatch([
      { pdfId: 'shrink-page', pageIndex: 0, originalBlob: null, optimizedBlob: blobWithReportedSize(50 * MB) },
      { pdfId: 'grow-page', pageIndex: 0, originalBlob: null, optimizedBlob: blobWithReportedSize(100 * MB) },
    ]);

    const internals = pwOptimizerStorage as unknown as StorageInternals;
    internals.cachedSizeBytes = null;
    expect(await pwOptimizerStorage.getCacheSize()).toBe(200 * MB);
    expect(await pwOptimizerStorage.getPage('shrink-page', 0)).not.toBeNull();
    expect(await pwOptimizerStorage.getPage('grow-page', 0)).not.toBeNull();
    expect(await pwOptimizerStorage.getPage('unrelated-page', 0)).not.toBeNull();
  });

  it('should return null for non-existent page', async () => {
    const record = await pwOptimizerStorage.getPage('non-existent', 0);
    expect(record).toBeNull();
  });

  it('should delete a page successfully', async () => {
    const pdfId = 'test-pdf-456';
    const pageIndex = 1;
    const originalBlob = new Blob(['original'], { type: 'image/png' });
    const optimizedBlob = new Blob(['optimized'], { type: 'image/jpeg' });

    await pwOptimizerStorage.storePage(pdfId, pageIndex, originalBlob, optimizedBlob);
    await pwOptimizerStorage.clearCache(pdfId);
    expect(await pwOptimizerStorage.getPage(pdfId, pageIndex)).toBeNull();
  });

  it('keeps cache accounting accurate when a page is overwritten', async () => {
    await pwOptimizerStorage.storePage('overwrite', 0, null, new Blob(['first-value']));
    expect(await pwOptimizerStorage.getCacheSize()).toBe(11);

    await pwOptimizerStorage.storePage('overwrite', 0, null, new Blob(['next']));
    expect(await pwOptimizerStorage.getCacheSize()).toBe(4);
  });

  it('keeps batch cache accounting accurate when existing pages are replaced', async () => {
    await pwOptimizerStorage.storePagesBatch([
      { pdfId: 'batch', pageIndex: 0, originalBlob: null, optimizedBlob: new Blob(['first']) },
      { pdfId: 'batch', pageIndex: 1, originalBlob: null, optimizedBlob: new Blob(['second']) },
    ]);
    expect(await pwOptimizerStorage.getCacheSize()).toBe(11);

    await pwOptimizerStorage.storePagesBatch([
      { pdfId: 'batch', pageIndex: 0, originalBlob: null, optimizedBlob: new Blob(['new']) },
      { pdfId: 'batch', pageIndex: 1, originalBlob: null, optimizedBlob: new Blob(['replacement']) },
      { pdfId: 'batch', pageIndex: 1, originalBlob: null, optimizedBlob: new Blob(['final']) },
    ]);
    expect(await pwOptimizerStorage.getCacheSize()).toBe(8);
  });
});
