import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Regression: qr-code-styling's default `saveAsBlob: true` re-reads the logo with
 * XMLHttpRequest(data:...). Our CSP `connect-src` has no `data:`, so the request is
 * blocked silently and the render promise never resolves (blank preview, hung download).
 */
describe('QR Studio logo vs CSP', () => {
  const layout = readFileSync('app/layout.tsx', 'utf8');
  const view = readFileSync('components/qrgen/QrGenToolView.tsx', 'utf8');

  it('keeps connect-src free of data: (no network loosening)', () => {
    const m = layout.match(/connect-src ([^;"]*)/);
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/data:/);
  });

  it('disables saveAsBlob so the logo never needs an XHR', () => {
    expect(view).toMatch(/saveAsBlob:\s*false/);
  });

  it('clears the logo with an empty string, not undefined', () => {
    expect(view).toMatch(/image:\s*logoDataUrl \?\? ''/);
  });
});
