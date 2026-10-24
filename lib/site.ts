/**
 * Central site configuration — the single authoritative source for every
 * absolute public URL (metadataBase, canonicals, Open Graph, sitemap, robots,
 * JSON-LD). Host-agnostic by design:
 *
 *   NEXT_PUBLIC_SITE_URL            → explicit override (any host)
 *   VERCEL_PROJECT_PRODUCTION_URL   → automatic on Vercel production
 *   legacy GitHub Pages fallback    → last resort so nothing silently breaks
 *
 * Nothing else in the codebase may hard-code a production domain.
 */

const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/\/$/, '');

export const SITE_URL =
  explicit ||
  (vercel ? `https://${vercel}` : 'https://juyel-dev.github.io/Notes-Print-Optimizer');

/** Build-time base path (Pages-style subpath deploys); '' at root hosts. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** Prefix a root-relative path with the deploy base path. */
export function withBase(path: string): string {
  return `${BASE_PATH}${path}`;
}

/** Absolute public URL for a root-relative path (canonical/OG/sitemap/JSON-LD). */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${withBase(path)}`;
}

// ---------------------------------------------------------------------------
// Social share images (Open Graph / Twitter) live INSIDE this repo, in
// `public/og/<slug>.png` (1200x630), and are served from the app's own origin.
// No external image repo or CDN is involved. A tool without its own card falls
// back to `home.png`, so every page always has a valid share image.
// ---------------------------------------------------------------------------

/** Folder under `public/` that holds the share cards. */
export const OG_DIR = '/og';

/**
 * Tools that have their own share card in `public/og/`. Keep in sync with the
 * PNGs in that folder (enforced by tests/unit/siteContract.test.ts).
 */
export const OG_CARD_NAMES: readonly string[] = [
  'home.png',
  'dark-print.png',
  'enhance-light-pdf.png',
  'protect-pdf.png',
  'pdf-to-images.png',
  'merge-pdf.png',
  'split-pdf.png',
  'image-to-pdf.png',
  'compress-pdf.png',
  'organize-pages.png',
  'n-up.png',
  'password-generator.png',
  'qr-generator.png',
  'word-counter.png',
  'case-converter.png',
];

/**
 * Absolute URL of a share card served by this app. `name` is the route slug +
 * '.png' (landing uses 'home.png'). Unknown names fall back to 'home.png'.
 */
export function ogImageUrl(name: string): string {
  const file = OG_CARD_NAMES.includes(name) ? name : 'home.png';
  return absoluteUrl(`${OG_DIR}/${file}`);
}
