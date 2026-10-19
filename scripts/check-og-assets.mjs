#!/usr/bin/env node
/**
 * Validator for social share cards (og:image / twitter:image).
 *
 * The cards live in this repo under `public/og/` and ship with the app, so
 * this check is fully offline. It verifies what social crawlers care about:
 *   - file exists and has PNG magic bytes
 *   - IHDR dimensions == 1200x630
 *   - weight: fail > 1 MB (crawler timeout risk), warn > 500 KB
 *   - the card list in lib/site.ts (OG_CARD_NAMES) matches the folder exactly
 *
 * Pass explicit names (e.g. `home.png merge-pdf.png`) to check a subset.
 * Zero deps.
 *
 * Usage: npm run check:og   |   node scripts/check-og-assets.mjs [names...]
 */

import { readFile, readdir } from 'node:fs/promises';

const DIR = new URL('../public/og/', import.meta.url);
const DIMS = { w: 1200, h: 630 };
const HARD_CAP = 1024 * 1024;
const SOFT_CAP = 500 * 1024;

async function declaredNames() {
  const text = await readFile(new URL('../lib/site.ts', import.meta.url), 'utf8');
  const block = text.match(/OG_CARD_NAMES[^=]*=\s*\[([\s\S]*?)\]/);
  if (!block) throw new Error('OG_CARD_NAMES not found in lib/site.ts');
  return [...block[1].matchAll(/'([a-z0-9-]+\.png)'/g)].map((m) => m[1]);
}

const declared = await declaredNames();
const onDisk = (await readdir(DIR)).filter((f) => f.endsWith('.png'));
const names = process.argv.slice(2).length ? process.argv.slice(2) : declared;

let failures = 0;

for (const f of onDisk) {
  if (!declared.includes(f)) {
    failures += 1;
    console.error(`FAIL ${f} — file exists in public/og but is not listed in OG_CARD_NAMES (lib/site.ts)`);
  }
}

for (const name of names) {
  let buf;
  try {
    buf = await readFile(new URL(name, DIR));
  } catch {
    failures += 1;
    console.error(`FAIL ${name} — missing in public/og/`);
    continue;
  }

  const problems = [];
  const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length <= 24 || !buf.subarray(0, 8).equals(magic)) {
    problems.push('not a PNG (magic bytes)');
  } else {
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    if (w !== DIMS.w || h !== DIMS.h) problems.push(`dimensions ${w}x${h} != ${DIMS.w}x${DIMS.h}`);
  }
  if (buf.length > HARD_CAP) problems.push(`${(buf.length / 1024).toFixed(0)} KB exceeds hard cap 1 MB`);

  const kb = (buf.length / 1024).toFixed(0);
  if (problems.length) {
    failures += 1;
    console.error(`FAIL ${name} — ${problems.join('; ')}`);
  } else if (buf.length > SOFT_CAP) {
    console.warn(`WARN ${name} — OK but ${kb} KB > 500 KB target`);
  } else {
    console.log(`OK   ${name} — PNG ${DIMS.w}x${DIMS.h} ${kb} KB`);
  }
}

if (failures) {
  console.error(`\n${failures} problem(s) found — fix public/og before sharing links.`);
  process.exit(1);
}
console.log(`\nAll ${names.length} share cards verified.`);
