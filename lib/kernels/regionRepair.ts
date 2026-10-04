/**
 * Region-aware repair for DARK-SOURCE pages (light-on-dark slides).
 *
 * The page-wide rule "bright pixel => ink" is right for chalk-style notes on a
 * dark board, but a real lecture slide also carries two kinds of region
 * where that rule is wrong:
 *
 *  1. LIGHT PANELS (textbook excerpt, question card, QR card): the paper is
 *     bright and the text is dark, so the page-wide rule inverts them into a
 *     solid black block with the words knocked out.
 *  2. FLAT COLOUR FILLS (orange title band, red number discs): the fill and
 *     the white text on it are both "bright", so the band prints as a black
 *     slab and the title / number disappears into it.
 *
 * (Photos are a known third case — thresholding gives speckle — but a
 * reliable photo detector is out of scope here; they are left to the normal
 * classifier exactly as before.)
 *
 * This module fixes each locally, from the pixels themselves (no template or
 * position assumptions), and leaves every pixel outside those regions to the
 * normal classifier. It is a no-op on pages that contain none of them, so pure
 * chalkboard slides are byte-identical to before.
 */

const LIGHT_LUM = 185;
const MID_LO = 40;
const MID_HI = 215;

function lumOf(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Separable box max (dilate) / min (erode) on a 0/1 grid, radius r. */
function morph(src: Uint8Array, gw: number, gh: number, r: number, wantMax: boolean): Uint8Array {
  const tmp = new Uint8Array(src.length);
  const out = new Uint8Array(src.length);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let v = wantMax ? 0 : 1;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(gw - 1, x + r);
      for (let k = x0; k <= x1; k++) {
        const s = src[y * gw + k];
        if (wantMax ? s > v : s < v) v = s;
      }
      tmp[y * gw + x] = v;
    }
  }
  for (let y = 0; y < gh; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(gh - 1, y + r);
    for (let x = 0; x < gw; x++) {
      let v = wantMax ? 0 : 1;
      for (let k = y0; k <= y1; k++) {
        const s = tmp[k * gw + x];
        if (wantMax ? s > v : s < v) v = s;
      }
      out[y * gw + x] = v;
    }
  }
  return out;
}

interface GridComponent {
  cells: number[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function gridComponents(mask: Uint8Array, gw: number, gh: number): GridComponent[] {
  const seen = new Uint8Array(mask.length);
  const comps: GridComponent[] = [];
  const stack: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    const cells: number[] = [];
    let minX = gw, minY = gh, maxX = -1, maxY = -1;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const c = stack.pop() as number;
      cells.push(c);
      const cx = c % gw;
      const cy = (c / gw) | 0;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      if (cx > 0 && mask[c - 1] && !seen[c - 1]) { seen[c - 1] = 1; stack.push(c - 1); }
      if (cx < gw - 1 && mask[c + 1] && !seen[c + 1]) { seen[c + 1] = 1; stack.push(c + 1); }
      if (cy > 0 && mask[c - gw] && !seen[c - gw]) { seen[c - gw] = 1; stack.push(c - gw); }
      if (cy < gh - 1 && mask[c + gw] && !seen[c + gw]) { seen[c + gw] = 1; stack.push(c + gw); }
    }
    comps.push({ cells, minX, minY, maxX, maxY });
  }
  return comps;
}

export interface RegionRepairResult {
  panels: number;
  fills: number;
}

/** Step 1: light text panels. Mutates `fm` (1 = ink). */
function repairLightPanels(
  src: Uint8ClampedArray,
  fm: Uint8Array,
  w: number,
  h: number,
  out: RegionRepairResult,
): void {
  const f = Math.max(2, Math.round(Math.min(w, h) / 270));
  const gw = Math.ceil(w / f);
  const gh = Math.ceil(h / f);
  const light = new Uint8Array(gw * gh);

  for (let gy = 0; gy < gh; gy++) {
    const y1 = Math.min(h, (gy + 1) * f);
    for (let gx = 0; gx < gw; gx++) {
      const x1 = Math.min(w, (gx + 1) * f);
      let n = 0, l = 0;
      for (let y = gy * f; y < y1; y++) {
        let i = (y * w + gx * f) * 4;
        for (let x = gx * f; x < x1; x++, i += 4) {
          n++;
          if (lumOf(src[i], src[i + 1], src[i + 2]) >= LIGHT_LUM) l++;
        }
      }
      if (n > 0 && l / n >= 0.5) light[gy * gw + gx] = 1;
    }
  }

  const closed = morph(morph(light, gw, gh, 2, true), gw, gh, 2, false);
  const comps = gridComponents(closed, gw, gh);
  const gridArea = gw * gh;
  const panelCell = new Uint8Array(gw * gh); // 1 = text panel

  for (const c of comps) {
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    if (c.cells.length / gridArea < 0.025) continue;
    if (bw < gw * 0.15 || bh < gh * 0.10) continue;
    if (c.cells.length / (bw * bh) < 0.6) continue;

    /* Panel character: paper+text is bi-modal (few mid-tones); a picture on a
       light backdrop is not. */
    let mid = 0, tot = 0;
    for (const cell of c.cells) {
      const cx = (cell % gw) * f;
      const cy = ((cell / gw) | 0) * f;
      const i = (Math.min(h - 1, cy + (f >> 1)) * w + Math.min(w - 1, cx + (f >> 1))) * 4;
      const l = lumOf(src[i], src[i + 1], src[i + 2]);
      tot++;
      if (l >= MID_LO && l <= MID_HI) mid++;
    }
    /* A picture on a light backdrop is not bi-modal; leave it to the normal
       classifier rather than forcing text rules on it. */
    if (tot > 0 && mid / tot >= 0.45) continue;
    for (const cell of c.cells) panelCell[cell] = 1;
    out.panels++;
  }

  /* Panel text: ink = dark or vivid-dark pixels. */
  for (let y = 0; y < h; y++) {
    const gy = (y / f) | 0;
    for (let x = 0; x < w; x++) {
      const k = panelCell[gy * gw + ((x / f) | 0)];
      if (k !== 1) continue;
      const i = (y * w + x) * 4;
      const r = src[i], g = src[i + 1], b = src[i + 2];
      const l = lumOf(r, g, b);
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      fm[y * w + x] = l < 150 || (sat >= 70 && l < 200) ? 1 : 0;
    }
  }
}

/**
 * Step 2: hollow out large flat colour fills (title bands, number discs).
 * The fill colour is dropped, the outline is kept, and whatever contrasts
 * with the fill (the white title text, the number) stays as ink.
 */
function hollowFlatFills(
  src: Uint8ClampedArray,
  fm: Uint8Array,
  w: number,
  h: number,
  out: RegionRepairResult,
): void {
  const total = w * h;
  const label = new Int32Array(total);
  const queue = new Int32Array(total);
  const minArea = Math.max(300, Math.floor(total * 0.0015));
  let next = 1;

  for (let s = 0; s < total; s++) {
    if (fm[s] !== 1 || label[s] !== 0) continue;
    const id = next++;
    let head = 0, tail = 0;
    queue[tail++] = s;
    label[s] = id;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    while (head < tail) {
      const c = queue[head++];
      const cx = c % w;
      const cy = (c / w) | 0;
      if (cx < x0) x0 = cx;
      if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy;
      if (cy > y1) y1 = cy;
      if (cx > 0 && fm[c - 1] === 1 && label[c - 1] === 0) { label[c - 1] = id; queue[tail++] = c - 1; }
      if (cx < w - 1 && fm[c + 1] === 1 && label[c + 1] === 0) { label[c + 1] = id; queue[tail++] = c + 1; }
      if (cy > 0 && fm[c - w] === 1 && label[c - w] === 0) { label[c - w] = id; queue[tail++] = c - w; }
      if (cy < h - 1 && fm[c + w] === 1 && label[c + w] === 0) { label[c + w] = id; queue[tail++] = c + w; }
    }
    const area = tail;
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    if (area < minArea || Math.min(cw, ch) < 18) continue;
    if (area / (cw * ch) < 0.5) continue;
    /* Dominant colour (4 bits/channel histogram, sampled). */
    const bins = new Map<number, number>();
    let sampled = 0;
    for (let k = 0; k < tail; k += 5) {
      const i = queue[k] * 4;
      const key = ((src[i] >> 4) << 8) | ((src[i + 1] >> 4) << 4) | (src[i + 2] >> 4);
      bins.set(key, (bins.get(key) ?? 0) + 1);
      sampled++;
    }
    let bestKey = 0, bestCount = 0;
    for (const [k, v] of bins) if (v > bestCount) { bestCount = v; bestKey = k; }
    const fr = ((bestKey >> 8) & 15) * 16 + 8;
    const fg = ((bestKey >> 4) & 15) * 16 + 8;
    const fb = (bestKey & 15) * 16 + 8;
    const fillSat = Math.max(fr, fg, fb) - Math.min(fr, fg, fb);
    /* Only COLOURED flat fills: a white/grey fill is body text or a bold title
       and must stay solid. */
    if (fillSat < 40) continue;
    let near = 0;
    for (let k = 0; k < tail; k += 5) {
      const i = queue[k] * 4;
      const d = Math.abs(src[i] - fr) + Math.abs(src[i + 1] - fg) + Math.abs(src[i + 2] - fb);
      if (d <= 90) near++;
    }
    if (near / Math.max(1, sampled) < 0.55) continue;

    /* Drop fill pixels except a 2px rim, keep contrasting pixels (text). */
    for (let k = 0; k < tail; k++) {
      const c = queue[k];
      const i = c * 4;
      const d = Math.abs(src[i] - fr) + Math.abs(src[i + 1] - fg) + Math.abs(src[i + 2] - fb);
      if (d > 130) continue;
      const cx = c % w;
      const cy = (c / w) | 0;
      const rim =
        cx < 2 || cy < 2 || cx >= w - 2 || cy >= h - 2 ||
        label[c - 2] !== id || label[c + 2] !== id ||
        label[c - 2 * w] !== id || label[c + 2 * w] !== id;
      if (!rim) fm[c] = 0;
    }
    out.fills++;
  }
}

/** Run the full repair. Cheap early-out keeps pure-chalkboard pages untouched. */
export function repairDarkSourceRegions(
  src: Uint8ClampedArray,
  fm: Uint8Array,
  w: number,
  h: number,
): RegionRepairResult {
  const out: RegionRepairResult = { panels: 0, fills: 0 };
  repairLightPanels(src, fm, w, h, out);
  hollowFlatFills(src, fm, w, h, out);
  return out;
}
