import { describe, expect, it } from 'vitest';
import { buildOriginalPassthrough } from '../../lib/nup/nupService';

/** jsdom's Blob has no .arrayBuffer() — FileReader does the job. */
function blobBytes(blob: Blob): Promise<Uint8Array> {
  const maybe = blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof maybe.arrayBuffer === 'function') return maybe.arrayBuffer().then((b) => new Uint8Array(b));
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(new Uint8Array(fr.result as ArrayBuffer));
    fr.onerror = () => reject(fr.error);
    fr.readAsArrayBuffer(blob);
  });
}

describe('buildOriginalPassthrough', () => {
  it('passes input bytes through untouched as a PDF blob', async () => {
    const input = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 1, 2, 3]);
    const r = buildOriginalPassthrough(input, 4);
    expect(r.blob.type).toBe('application/pdf');
    expect(r.blob.size).toBe(input.length);
    expect(r.sheets).toBe(4);
    expect(r.ms).toBe(0);
    expect(Array.from(await blobBytes(r.blob))).toEqual(Array.from(input));
  });

  it('does not alias the input buffer', async () => {
    const input = new Uint8Array([1, 2, 3]);
    const r = buildOriginalPassthrough(input, 1);
    input[0] = 99;
    expect((await blobBytes(r.blob))[0]).toBe(1);
  });

  it('floors sheet count at 1 for empty input', () => {
    expect(buildOriginalPassthrough(new Uint8Array([1]), 0).sheets).toBe(1);
  });
});
