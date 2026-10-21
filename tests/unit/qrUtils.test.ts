import { describe, expect, it } from 'vitest';
import { contrastRatio, escapeWifi, luminance, slugify } from '@/components/qrgen/qrUtils';
import { ECC_CAPACITY, EMAIL_RE } from '@/components/qrgen/qrConstants';

/**
 * Golden values recorded from the original in-component helpers BEFORE they were
 * moved out of QrGenToolView.tsx, so the extraction is proven behavior-preserving.
 */
describe('QR Studio helpers (golden values)', () => {
  it('escapeWifi escapes \\ ; , " : for the WIFI: payload', () => {
    expect(escapeWifi('plain')).toBe('plain');
    expect(escapeWifi('a;b')).toBe('a\\;b');
    expect(escapeWifi('a,b')).toBe('a\\,b');
    expect(escapeWifi('a:b')).toBe('a\\:b');
    expect(escapeWifi('quote"s')).toBe('quote\\"s');
    expect(escapeWifi('back\\slash')).toBe('back\\\\slash');
    expect(escapeWifi('M;y"W:i,F\\i')).toBe('M\\;y\\"W\\:i\\,F\\\\i');
  });

  it('luminance matches WCAG relative luminance', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBe(1);
    expect(luminance('#0f172a')).toBeCloseTo(0.008815176790098227, 12);
    expect(luminance('#28409e')).toBeCloseTo(0.06586529971345939, 12);
    expect(luminance('#7a4808')).toBeCloseTo(0.08789836427634304, 12);
  });

  it('contrastRatio is symmetric and matches recorded values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#ffffff', '#000000')).toBe(21);
    expect(contrastRatio('#0f172a', '#ffffff')).toBeCloseTo(17.85253496299567, 10);
    expect(contrastRatio('#28409e', '#eef2ff')).toBeCloseTo(8.104359499510402, 10);
    expect(contrastRatio('#777777', '#888888')).toBeCloseTo(1.2632533688247014, 10);
  });

  it('slugify builds a safe, short file name', () => {
    expect(slugify('https://Example.com/Menu?x=1')).toBe('example-com-menu-x-1');
    expect(slugify('HELLO World!!')).toBe('hello-world');
    expect(slugify('  --a--  ')).toBe('a');
    expect(slugify('http://a.b')).toBe('a-b');
    expect(slugify('x'.repeat(40))).toBe('x'.repeat(28));
    expect(slugify('Scan me 👋')).toBe('scan-me');
  });

  it('keeps ECC capacities and the email pattern unchanged', () => {
    expect(ECC_CAPACITY).toEqual({ L: 2953, M: 2331, Q: 1663, H: 1273 });
    expect(EMAIL_RE.test('hello@example.com')).toBe(true);
    expect(EMAIL_RE.test('no-at-sign')).toBe(false);
  });
});
