// Colour helpers for page profiling (moved verbatim from analysis.ts).

export const HUE_BIN_COUNT = 18;
export const HUE_BIN_SIZE = 360 / HUE_BIN_COUNT;

export function rgbToHueSat(r: number, g: number, b: number): { hue: number; saturation: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0 || max === 0) return { hue: 0, saturation: 0 };

  let hue = 0;
  if (max === r) hue = ((g - b) * 60 / delta + 360) % 360;
  else if (max === g) hue = (b - r) * 60 / delta + 120;
  else hue = (r - g) * 60 / delta + 240;

  return {
    hue,
    saturation: (delta / max) * 255,
  };
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
