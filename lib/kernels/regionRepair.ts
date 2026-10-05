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

  /* Sample every 2nd pixel in x and y: 4x cheaper and plenty for a 50% test. */
  for (let gy = 0; gy < gh; gy++) {
    const y1 = Math.min(h, (gy + 1) * f);
    for (let gx = 0; gx < gw; gx++) {
      const x1 = Math.min(w, (gx + 1) * f);
      let n = 0, l = 0;
      for (let y = gy * f; y < y1; y += 2) {
        let i = (y * w + gx * f) * 4;
        for (let x = gx * f; x < x1; x += 2, i += 8) {
          n++;
          if (lumOf(src[i], src[i + 1], src[i + 2]) >= LIGHT_LUM) l++;
        }
      }
      if (n > 0 && l / n >= 0.5) light[gy * gw + gx] = 1;
    }
  }

  let lightCells = 0;
  for (let k = 0; k < light.length; k++) lightCells += light[k];
  if (lightCells < gw * gh * 0.025) return; // too little light area for any panel

  const closed = morph(morph(light, gw, gh, 2, true), gw, gh, 2, false);
  const comps = gridComponents(closed, gw, gh);
  const gridArea = gw * gh;
  const panelCell = new Uint8Array(gw * gh); // 1 = text panel
  const panelComps: GridComponent[] = [];

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
    panelComps.push(c);
    out.panels++;
  }

  if (out.panels === 0) return; // pure chalkboard page: nothing to repair

  /* Panel text: ink = dark or vivid-dark pixels. Only walk panel bounding
     boxes, with a per-column cell lookup instead of a division per pixel. */
  const xCell = new Int32Array(w);
  for (let x = 0; x < w; x++) xCell[x] = (x / f) | 0;
  for (const c of panelComps) {
    const x0 = c.minX * f;
    const x1 = Math.min(w, (c.maxX + 1) * f);
    const y0 = c.minY * f;
    const y1 = Math.min(h, (c.maxY + 1) * f);
    for (let y = y0; y < y1; y++) {
      const rowCells = ((y / f) | 0) * gw;
      for (let x = x0; x < x1; x++) {
        if (panelCell[rowCells + xCell[x]] !== 1) continue;
        const i = (y * w + x) * 4;
        const r = src[i], g = src[i + 1], b = src[i + 2];
        /* Fast path: clean paper is the vast majority of a panel. */
        if (r > 200 && g > 200 && b > 200) { fm[y * w + x] = 0; continue; }
        const l = lumOf(r, g, b);
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        fm[y * w + x] = l < 150 || (sat >= 70 && l < 200) ? 1 : 0;
      }
    }
  }
}

/**
 * Step 2: hollow out large flat colour fills (title bands, number discs).
 * The fill colour is dropped, the outline is kept, and whatever contrasts
 * with the fill (the white title text, the number) stays as ink.
 *
 * Works on a coarse grid of "solid" 12x12 blocks (a flat fill contains whole
 * solid blocks; strokes and text never do), so a page with no fill costs one
 * cheap scan and a page with fills only touches those bounding boxes. There is
 * no full-page labelling or large temporary allocation.
 */
function hollowFlatFills(
  src: Uint8ClampedArray,
  fm: Uint8Array,
  w: number,
  h: number,
  out: RegionRepairResult,
): void {
  const SB = 6;
  const sbw = (w / SB) | 0;
  const sbh = (h / SB) | 0;
  if (sbw < 4 || sbh < 4) return;
  const solidGrid = new Uint8Array(sbw * sbh);
  let solid = 0;
  for (let by = 0; by < sbh; by++) {
    for (let bx = 0; bx < sbw; bx++) {
      let all = true;
      for (let y = by * SB; y < (by + 1) * SB && all; y += 2) {
        const row = y * w + bx * SB;
        for (let x = 0; x < SB; x += 2) if (fm[row + x] !== 1) { all = false; break; }
      }
      if (all) { solidGrid[by * sbw + bx] = 1; solid++; }
    }
  }
  if (solid < 40) return;

  let visited: Uint8Array | null = null; // allocated only if a candidate fill exists
  let queueBuf: Int32Array | null = null;
  const minCells = Math.max(12, Math.floor((w * h * 0.001) / (SB * SB)));
  for (const c of gridComponents(solidGrid, sbw, sbh)) {
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    if (c.cells.length < minCells || Math.min(bw, bh) < 2) continue;
    if (c.cells.length / (bw * bh) < 0.45) continue;

    /* Dominant colour over the solid cells (4 bits/channel histogram). */
    const bins = new Map<number, number>();
    let sampled = 0;
    for (const cell of c.cells) {
      const x0 = (cell % sbw) * SB;
      const y0 = ((cell / sbw) | 0) * SB;
      for (let y = y0; y < y0 + SB; y += 2) {
        for (let x = x0; x < x0 + SB; x += 2) {
          const i = (y * w + x) * 4;
          const key = ((src[i] >> 4) << 8) | ((src[i + 1] >> 4) << 4) | (src[i + 2] >> 4);
          bins.set(key, (bins.get(key) ?? 0) + 1);
          sampled++;
        }
      }
    }
    let bestKey = 0, bestCount = 0;
    for (const [k, v] of bins) if (v > bestCount) { bestCount = v; bestKey = k; }
    const fr = ((bestKey >> 8) & 15) * 16 + 8;
    const fg = ((bestKey >> 4) & 15) * 16 + 8;
    const fb = (bestKey & 15) * 16 + 8;
    /* Only COLOURED flat fills: a white/grey fill is body text or a bold title
       and must stay solid. */
    if (Math.max(fr, fg, fb) - Math.min(fr, fg, fb) < 40) continue;
    if (bestCount / Math.max(1, sampled) < 0.55) continue; // a photo or gradient, not a flat fill

    /* A title band / number disc is (nearly) its own connected component. A
       filled shape with long strokes running into it is a diagram element whose
       fill carries meaning, so leave it solid. Bounded flood fill from the
       solid area: abort as soon as the component outgrows the fill. */
    {
      const solidW = bw * SB;
      const solidH = bh * SB;
      const solidArea = c.cells.length * SB * SB;
      const maxArea = solidArea * 3 + 4000;
      const maxW = solidW + 4 * SB;
      const maxH = solidH + 4 * SB;
      visited ??= new Uint8Array(w * h);
      const seedCell = c.cells[(c.cells.length / 2) | 0];
      const seed = (((seedCell / sbw) | 0) * SB + (SB >> 1)) * w + (seedCell % sbw) * SB + (SB >> 1);
      const qLen = Math.min(w * h, maxArea + 8);
      if (!queueBuf || queueBuf.length < qLen) queueBuf = new Int32Array(qLen);
      const q = queueBuf;
      let head = 0, tail = 0, ok = true;
      let cx0 = w, cx1 = -1, cy0 = h, cy1 = -1;
      q[tail++] = seed;
      visited[seed] = 1;
      while (head < tail) {
        const k = q[head++];
        const x = k % w;
        const y = (k / w) | 0;
        if (x < cx0) cx0 = x;
        if (x > cx1) cx1 = x;
        if (y < cy0) cy0 = y;
        if (y > cy1) cy1 = y;
        if (cx1 - cx0 + 1 > maxW || cy1 - cy0 + 1 > maxH) { ok = false; break; }
        /* Inlined 4-neighbour push (no per-pixel closures: this loop is hot). */
        if (x > 0 && fm[k - 1] === 1 && visited[k - 1] === 0) { visited[k - 1] = 1; q[tail++] = k - 1; }
        if (x < w - 1 && fm[k + 1] === 1 && visited[k + 1] === 0) { visited[k + 1] = 1; q[tail++] = k + 1; }
        if (y > 0 && fm[k - w] === 1 && visited[k - w] === 0) { visited[k - w] = 1; q[tail++] = k - w; }
        if (y < h - 1 && fm[k + w] === 1 && visited[k + w] === 0) { visited[k + w] = 1; q[tail++] = k + w; }
        if (tail >= q.length - 4) { ok = false; break; }
      }
      for (let t = 0; t < tail; t++) visited[q[t]] = 0; // reset for the next candidate
      if (!ok) continue;
    }

    /* Refine inside the (slightly grown) bounding box: drop fill-coloured ink
       except a 2px rim, keep contrasting pixels (the title / the number). */
    const x0 = Math.max(0, c.minX * SB - SB);
    const x1 = Math.min(w, (c.maxX + 1) * SB + SB);
    const y0 = Math.max(0, c.minY * SB - SB);
    const y1 = Math.min(h, (c.maxY + 1) * SB + SB);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const k = y * w + x;
        if (fm[k] !== 1) continue;
        const i = k * 4;
        if (Math.abs(src[i] - fr) + Math.abs(src[i + 1] - fg) + Math.abs(src[i + 2] - fb) > 130) continue;
        const rim =
          x < 2 || y < 2 || x >= w - 2 || y >= h - 2 ||
          fm[k - 2] === 0 || fm[k + 2] === 0 || fm[k - 2 * w] === 0 || fm[k + 2 * w] === 0;
        /* 2 = "cleared": still counts as part of the fill for neighbours'
           rim tests, so the scan order cannot turn the interior into rim. */
        if (!rim) fm[k] = 2;
      }
    }
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) if (fm[y * w + x] === 2) fm[y * w + x] = 0;
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
