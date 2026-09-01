/**
 * CSP contract — app/layout.tsx emits a CSP via <meta http-equiv>.
 * For static export (output:'export') Next.js emits many inline scripts
 * (self.__next_f.push... RSC payloads). A hash-source-only CSP would block
 * those and break hydration (19 smoke tests + lighthouse NO_LCP). So we keep
 * 'unsafe-inline' for script-src until we can emit nonces for every inline
 * script. This test guards the current contract and documents the reason.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const layoutSource = readFileSync(resolve(__dirname, '../../app/layout.tsx'), 'utf8');

describe('CSP contract', () => {
  it('script-src keeps unsafe-inline for static-export compatibility', () => {
    const cspMatch = layoutSource.match(/content="([^"]*script-src[^"]*)"/);
    expect(cspMatch).not.toBeNull();
    const scriptSrcDirective = cspMatch![1].split(';').find((d) => d.trim().startsWith('script-src'));
    expect(scriptSrcDirective).toBeDefined();
    // Static export needs this — see app/layout.tsx comment above THEME_INIT_SCRIPT
    expect(scriptSrcDirective).toContain("'unsafe-inline'");
    expect(scriptSrcDirective).toContain("'wasm-unsafe-eval'");
    expect(scriptSrcDirective).toContain("'self'");
  });

  it('THEME_INIT_SCRIPT is still present and non-empty', () => {
    const match = layoutSource.match(/const THEME_INIT_SCRIPT = `([\s\S]*?)`;/);
    expect(match).not.toBeNull();
    expect(match![1].trim().length).toBeGreaterThan(20);
  });
});
