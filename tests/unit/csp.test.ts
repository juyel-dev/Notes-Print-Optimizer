/**
 * CSP hash-source contract — app/layout.tsx's inline theme-init script is
 * allowed to run via a `sha256-...` hash-source in the CSP <meta> tag,
 * instead of the weaker `'unsafe-inline'`. If the script's contents ever
 * change without regenerating that hash, the browser silently drops the
 * script (console warning only, no user-visible error) and dark/light mode
 * stops applying on load. This test parses the real source file and
 * verifies the hash actually matches, so a mismatch fails CI instead.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const layoutSource = readFileSync(resolve(__dirname, '../../app/layout.tsx'), 'utf8');

function extractThemeInitScript(source: string): string {
  const match = source.match(/const THEME_INIT_SCRIPT = `([\s\S]*?)`;/);
  if (!match) throw new Error('THEME_INIT_SCRIPT not found in app/layout.tsx — did it get renamed?');
  return match[1];
}

function extractCspHashSource(source: string): string {
  const match = source.match(/script-src[^"]*?'(sha256-[^']+)'/);
  if (!match) throw new Error("No 'sha256-...' hash-source found in the CSP script-src directive — did it revert to 'unsafe-inline'?");
  return match[1];
}

describe('CSP hash-source contract', () => {
  it('script-src hash matches the actual THEME_INIT_SCRIPT contents', () => {
    const script = extractThemeInitScript(layoutSource);
    const expectedHash = 'sha256-' + createHash('sha256').update(script, 'utf8').digest('base64');
    const actualHash = extractCspHashSource(layoutSource);
    expect(actualHash).toBe(expectedHash);
  });

  it('CSP does not fall back to script-src unsafe-inline', () => {
    const cspMatch = layoutSource.match(/content="([^"]*script-src[^"]*)"/);
    expect(cspMatch).not.toBeNull();
    const scriptSrcDirective = cspMatch![1].split(';').find((d) => d.trim().startsWith('script-src'));
    expect(scriptSrcDirective).toBeDefined();
    expect(scriptSrcDirective).not.toContain("'unsafe-inline'");
  });
});
