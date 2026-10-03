/** Shared dark-frame check (see hasDarkFrame). */

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * True when the slide's outer frame is almost entirely dark. A dark slide that
 * carries a large light panel (diagram, table, photo) can have fewer than 45%
 * dark pixels overall, yet its background is clearly dark. The frame is the
 * most reliable place to read the background from.
 */
export function hasDarkFrame(src: Uint8ClampedArray, width: number, height: number): boolean {
  const bx = Math.max(2, Math.floor(width * 0.03));
  const by = Math.max(2, Math.floor(height * 0.03));
  const step = Math.max(1, Math.floor(Math.min(width, height) / 400));
  let dark = 0;
  let total = 0;
  for (let y = 0; y < height; y += step) {
    const inBand = y < by || y >= height - by;
    for (let x = 0; x < width; x += step) {
      if (!inBand && x >= bx && x < width - bx) continue;
      const i = (y * width + x) * 4;
      total++;
      if (luminance(src[i], src[i + 1], src[i + 2]) < 55) dark++;
    }
  }
  return total > 0 && dark / total >= 0.85;
}
