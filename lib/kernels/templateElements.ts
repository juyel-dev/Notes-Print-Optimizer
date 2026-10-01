/**
 * Template-aware cleanup for recurring lecture-slide chrome.
 *
 * This is intentionally separate from the old decorative/banner detector.
 * It uses tolerant, normalized geometry plus local color/shape evidence:
 * exact pixel coordinates are not required.
 *
 * Goals:
 *  - turn recurring colored topic-header fills into white while preserving
 *    the title/handwriting inside them;
 *  - turn recurring colored number-marker fills into white while preserving
 *    the number glyph;
 *  - remove the small PW branding mark from the top-right corner.
 *
 * The detector is conservative by design. A miss is preferable to erasing
 * legitimate handwritten content.
 */

export interface TemplateElementStats {
  headerDetected: boolean;
  markerCount: number;
  logoDetected: boolean;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : ((max - min) / max) * 255;
}

function colorDistance(
  r: number,
  g: number,
  b: number,
  mr: number,
  mg: number,
  mb: number,
): number {
  const dr = r - mr;
  const dg = g - mg;
  const db = b - mb;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function isHeaderFillColor(r: number, g: number, b: number): boolean {
  const s = saturation(r, g, b);
  const l = luminance(r, g, b);
  return s >= 38 && l >= 22 && l <= 238;
}

function isLightLogoPixel(r: number, g: number, b: number): boolean {
  const l = luminance(r, g, b);
  return l >= 145 && saturation(r, g, b) <= 95;
}

function clampBox(box: Box, width: number, height: number): Box {
  return {
    x0: Math.max(0, Math.min(width - 1, box.x0)),
    y0: Math.max(0, Math.min(height - 1, box.y0)),
    x1: Math.max(0, Math.min(width - 1, box.x1)),
    y1: Math.max(0, Math.min(height - 1, box.y1)),
  };
}

function detectHeader(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { box: Box; fill: [number, number, number] } | null {
  type Candidate = {
    y0: number;
    y1: number;
    x0: number;
    x1: number;
    score: number;
    sumR: number;
    sumG: number;
    sumB: number;
    count: number;
  };

  const startY = Math.max(1, Math.floor(height * 0.01));
  const endY = Math.floor(height * 0.24);
  const xStep = Math.max(2, Math.floor(width / 140));

  const evaluateRun = (y0: number, y1: number): Candidate | null => {
    const runHeight = y1 - y0 + 1;
    if (
      runHeight < Math.max(8, Math.floor(height * 0.025)) ||
      runHeight > Math.floor(height * 0.18)
    ) return null;

    let x0 = width, x1 = -1;
    let colored = 0;
    let samples = 0;
    let sumR = 0, sumG = 0, sumB = 0, count = 0;

    const yStep = Math.max(1, Math.floor(runHeight / 12));
    for (let y = y0; y <= y1; y += yStep) {
      for (let x = 0; x < width; x += xStep) {
        const i = (y * width + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        samples++;
        if (!isHeaderFillColor(r, g, b)) continue;
        colored++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        sumR += r; sumG += g; sumB += b; count++;
      }
    }

    if (x1 < x0 || samples === 0) return null;
    const coverage = colored / samples;
    const widthRatio = (x1 - x0 + 1) / width;

    // Tolerant geometry: the header may shift several percent in either
    // direction, but it should remain a substantial, wide top element.
    // Coverage is measured over full-width row samples, so a large title
    // inside the tube legitimately displaces fill — keep the bar low and
    // let the title-contrast and tube-shape gates do the discrimination.
    if (coverage < 0.30 || widthRatio < 0.24 || x0 / width > 0.28) return null;

    // A real topic header should contain readable title pixels inside the
    // colored fill. Solid decorative bars/boxes must not qualify merely from
    // their geometry. Use tolerant local contrast evidence rather than OCR.
    const innerX0 = Math.max(0, x0 + Math.floor((x1 - x0 + 1) * 0.04));
    const innerX1 = Math.min(width - 1, x1 - Math.floor((x1 - x0 + 1) * 0.04));
    const innerY0 = Math.max(0, y0 + Math.floor((y1 - y0 + 1) * 0.12));
    const innerY1 = Math.min(height - 1, y1 - Math.floor((y1 - y0 + 1) * 0.12));
    const meanR = sumR / count;
    const meanG = sumG / count;
    const meanB = sumB / count;
    let titleContrast = 0;
    let titleSamples = 0;
    const sampleYStep = Math.max(1, Math.floor(runHeight / 10));
    for (let y = innerY0; y <= innerY1; y += sampleYStep) {
      for (let x = innerX0; x <= innerX1; x += xStep) {
        const i = (y * width + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const lumDelta = Math.abs(luminance(r, g, b) - luminance(meanR, meanG, meanB));
        const rgbDelta = colorDistance(r, g, b, meanR, meanG, meanB);
        // Topic text may be dark-on-color or light-on-color. We therefore
        // require contrast against the fill instead of assuming white text.
        if (lumDelta >= 55 || rgbDelta >= 70) titleContrast++;
        titleSamples++;
      }
    }
    const titleCoverage = titleSamples > 0 ? titleContrast / titleSamples : 0;
    if (titleCoverage < 0.008 || titleCoverage > 0.40) return null;

    // Structural signature of the recurring tube: its rounded end caps are
    // shorter at the very first/last rows, while the middle reaches farther.
    // Compare the run's end rows against its middle (rather than coarse
    // thirds, which misalign whenever title text occupies the middle rows).
    // This normalized shape test is what separates the real header component
    // from ordinary rectangular colored bars/text in generic dark slides.
    const rowExtents: Array<{ min: number; max: number }> = [];
    const geometryStep = Math.max(1, Math.floor(runHeight / 18));
    for (let y = y0; y <= y1; y += geometryStep) {
      let rowMin = width;
      let rowMax = -1;
      for (let x = x0; x <= x1; x += xStep) {
        const i = (y * width + x) * 4;
        if (isHeaderFillColor(data[i], data[i + 1], data[i + 2])) {
          if (x < rowMin) rowMin = x;
          if (x > rowMax) rowMax = x;
        }
      }
      if (rowMax >= rowMin) rowExtents.push({ min: rowMin, max: rowMax });
    }

    const median = (values: number[]): number => {
      const sorted = [...values].sort((a, b) => a - b);
      if (sorted.length === 0) return 0;
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    };

    // End-cap rows: the first/last two sampled rows of the run. A capsule
    // tube is narrowest exactly at its ends; a rectangle is not.
    const edgeRows = [
      ...rowExtents.slice(0, 2),
      ...rowExtents.slice(Math.max(2, rowExtents.length - 2)),
    ];
    const midStart = Math.floor(rowExtents.length / 4);
    const midEnd = Math.max(midStart + 1, rowExtents.length - midStart);
    const midBand = rowExtents.slice(midStart, midEnd);

    const middleRight = median(midBand.map(row => row.max));
    const edgeRight = median(edgeRows.map(row => row.max));
    const middleLeft = median(midBand.map(row => row.min));
    const edgeLeft = median(edgeRows.map(row => row.min));

    const rightCapRetreat = (middleRight - edgeRight) / width;
    const leftBadgeBulge = (edgeLeft - middleLeft) / width;

    // The real template's cap curvature is subtle after rasterization, so
    // use a small normalized tolerance rather than demanding a large arc.
    if (rightCapRetreat < 0.008 && leftBadgeBulge < 0.005) return null;

    return {
      y0,
      y1,
      x0,
      x1,
      score:
        coverage * 2.0 +
        Math.min(1, widthRatio) * 0.9 +
        Math.min(1, titleCoverage * 3) * 0.5 +
        (x0 / width < 0.12 ? 0.35 : 0),
      sumR,
      sumG,
      sumB,
      count,
    };
  };

  let best: Candidate | null = null;
  let runStart = -1;
  let lastStrongRow = -1;
  // Text and the badge can interrupt the colored-fill signal for several
  // rows. Bridge short gaps instead of treating the same tube as multiple
  // independent banners. The gap is normalized to page height.
  const maxFillGap = Math.max(10, Math.floor(height * 0.035));

  for (let y = startY; y <= endY; y++) {
    let colored = 0;
    let samples = 0;
    for (let x = 0; x < width; x += xStep) {
      const i = (y * width + x) * 4;
      if (isHeaderFillColor(data[i], data[i + 1], data[i + 2])) colored++;
      samples++;
    }

    const coverage = samples > 0 ? colored / samples : 0;
    const strong = coverage >= 0.34;
    if (strong) {
      if (runStart < 0) runStart = y;
      lastStrongRow = y;
      continue;
    }

    if (runStart >= 0 && lastStrongRow >= 0 && y - lastStrongRow > maxFillGap) {
      const candidate = evaluateRun(runStart, lastStrongRow);
      if (candidate && (best === null || candidate.score > best.score)) best = candidate;
      runStart = -1;
      lastStrongRow = -1;
    }
  }
  if (runStart >= 0 && lastStrongRow >= runStart) {
    const candidate = evaluateRun(runStart, lastStrongRow);
    if (candidate && (best === null || candidate.score > best.score)) best = candidate;
  }

  const header = best;
  if (header === null || header.count < 20) return null;

  const yPad = Math.max(2, Math.floor((header.y1 - header.y0 + 1) * 0.18));
  const xPad = Math.max(2, Math.floor((header.x1 - header.x0 + 1) * 0.02));
  const box = clampBox({
    x0: header.x0 - xPad,
    y0: header.y0 - yPad,
    x1: header.x1 + xPad,
    y1: header.y1 + yPad,
  }, width, height);

  const fill: [number, number, number] = [
    header.sumR / header.count,
    header.sumG / header.count,
    header.sumB / header.count,
  ];
  return { box, fill };
}

function clearHeaderFill(
  data: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
  header: { box: Box; fill: [number, number, number] },
): void {
  const { box, fill } = header;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (
        saturation(r, g, b) >= 24 &&
        luminance(r, g, b) < 245 &&
        colorDistance(r, g, b, fill[0], fill[1], fill[2]) <= 82
      ) {
        // Remove the colored fill only. The actual white/near-white tube
        // border and the title text are not fill-colored, so they remain in
        // the foreground mask and therefore survive the B/W composite.
        mask[y * width + x] = 0;
      }
    }
  }
}

function detectColoredMarkers(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Array<{ box: Box; fill: [number, number, number] }> {
  const maxX = Math.min(width, Math.floor(width * 0.20));
  const minY = Math.floor(height * 0.22);
  const total = width * height;
  const seen = new Uint8Array(maxX * Math.max(0, height - minY));
  const out: Array<{ box: Box; fill: [number, number, number] }> = [];

  const idxAt = (x: number, y: number): number => (y - minY) * maxX + x;

  for (let y = minY; y < height; y++) {
    for (let x = 0; x < maxX; x++) {
      const vi = idxAt(x, y);
      if (seen[vi]) continue;
      const pi = (y * width + x) * 4;
      if (!isHeaderFillColor(data[pi], data[pi + 1], data[pi + 2])) {
        seen[vi] = 1;
        continue;
      }

      const queue: number[] = [vi];
      seen[vi] = 1;
      let head = 0;
      let x0 = x, x1 = x, y0 = y, y1 = y, area = 0;
      let sumR = 0, sumG = 0, sumB = 0;

      while (head < queue.length) {
        const q = queue[head++];
        const qx = q % maxX;
        const qy = Math.floor(q / maxX) + minY;
        if (qx < x0) x0 = qx;
        if (qx > x1) x1 = qx;
        if (qy < y0) y0 = qy;
        if (qy > y1) y1 = qy;
        const qi = (qy * width + qx) * 4;
        area++;
        sumR += data[qi]; sumG += data[qi + 1]; sumB += data[qi + 2];

        const neighbors = [
          [qx - 1, qy], [qx + 1, qy],
          [qx, qy - 1], [qx, qy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= maxX || ny < minY || ny >= height) continue;
          const ni = idxAt(nx, ny);
          if (seen[ni]) continue;
          const npi = (ny * width + nx) * 4;
          seen[ni] = 1;
          if (isHeaderFillColor(data[npi], data[npi + 1], data[npi + 2])) {
            queue.push(ni);
          }
        }
      }

      const cw = x1 - x0 + 1;
      const ch = y1 - y0 + 1;
      const bboxArea = cw * ch;
      const relArea = area / total;
      const aspect = cw / Math.max(ch, 1);
      const fillRatio = area / Math.max(1, bboxArea);
      const meanR = sumR / area, meanG = sumG / area, meanB = sumB / area;

      // Marker badges should contain an internal glyph/high-contrast mark.
      // This prevents solid colored squares/boxes from being mistaken for
      // numbered circles just because their geometry is compact.
      let glyphLight = 0;
      const glyphStep = Math.max(1, Math.floor(ch / 8));
      for (let gy = y0; gy <= y1; gy += glyphStep) {
        for (let gx = x0; gx <= x1; gx += glyphStep) {
          const gi = (gy * width + gx) * 4;
          const gl = luminance(data[gi], data[gi + 1], data[gi + 2]);
          if (gl >= 150 && colorDistance(data[gi], data[gi + 1], data[gi + 2], meanR, meanG, meanB) >= 70) {
            glyphLight++;
          }
        }
      }
      const glyphSamples = Math.max(1, Math.ceil((y1 - y0 + 1) / glyphStep) * Math.ceil((x1 - x0 + 1) / glyphStep));
      const glyphCoverage = glyphLight / glyphSamples;

      // A filled badge is solid color (plus its light glyph) inside its box,
      // while a handwritten letter leaves large black gaps between strokes.
      // Measure the inset interior: badges stay near zero dark pixels, stroke
      // glyphs exceed ~0.30. This is what keeps cursive letters inside body
      // text from being mistaken for numbered marker fills.
      const insetX = Math.max(1, Math.floor(cw * 0.10));
      const insetY = Math.max(1, Math.floor(ch * 0.10));
      let interiorDark = 0;
      let interiorTotal = 0;
      for (let iy = y0 + insetY; iy <= y1 - insetY; iy++) {
        for (let ix = x0 + insetX; ix <= x1 - insetX; ix++) {
          const gi = (iy * width + ix) * 4;
          interiorTotal++;
          if (luminance(data[gi], data[gi + 1], data[gi + 2]) < 45) interiorDark++;
        }
      }
      const interiorDarkRatio = interiorTotal > 0 ? interiorDark / interiorTotal : 1;

      if (
        area >= Math.max(20, Math.floor(total * 0.00008)) &&
        relArea <= 0.012 &&
        cw / width >= 0.006 &&
        cw / width <= 0.075 &&
        ch / height >= 0.006 &&
        ch / height <= 0.11 &&
        aspect >= 0.68 &&
        aspect <= 1.45 &&
        fillRatio >= 0.42 &&
        glyphCoverage >= 0.005 &&
        glyphCoverage <= 0.45 &&
        interiorDarkRatio <= 0.26
      ) {
        out.push({
          box: { x0, y0, x1, y1 },
          fill: [meanR, meanG, meanB],
        });
      }
    }
  }

  return out.slice(0, 12);
}

function clearMarkerFill(
  data: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  marker: { box: Box; fill: [number, number, number] },
): void {
  const { box, fill } = marker;
  const expanded = {
    x0: Math.max(0, box.x0 - 2),
    y0: Math.max(0, box.y0 - 2),
    x1: Math.min(width - 1, box.x1 + 2),
    y1: box.y1 + 2,
  };
  for (let y = expanded.y0; y <= expanded.y1; y++) {
    for (let x = expanded.x0; x <= expanded.x1; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (
        saturation(r, g, b) >= 24 &&
        luminance(r, g, b) < 245 &&
        colorDistance(r, g, b, fill[0], fill[1], fill[2]) <= 82
      ) {
        mask[y * width + x] = 0;
      }
    }
  }
}

function detectPwLogo(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Box | null {
  const x0 = Math.floor(width * 0.76);
  const yLimit = Math.floor(height * 0.18);
  const maxW = Math.floor(width * 0.10);
  const maxH = Math.floor(height * 0.13);
  const seen = new Uint8Array(Math.max(0, (width - x0) * yLimit));
  const idxAt = (x: number, y: number): number => (y * (width - x0)) + (x - x0);
  let best: { box: Box; score: number } | null = null;

  for (let y = 0; y < yLimit; y++) {
    for (let x = x0; x < width; x++) {
      const si = idxAt(x, y);
      if (seen[si]) continue;
      const pi = (y * width + x) * 4;
      if (!isLightLogoPixel(data[pi], data[pi + 1], data[pi + 2])) {
        seen[si] = 1;
        continue;
      }

      const queue = [si];
      seen[si] = 1;
      let head = 0;
      let bx0 = x, bx1 = x, by0 = y, by1 = y, area = 0;
      while (head < queue.length) {
        const q = queue[head++];
        const qx = q % (width - x0) + x0;
        const qy = Math.floor(q / (width - x0));
        if (qx < bx0) bx0 = qx;
        if (qx > bx1) bx1 = qx;
        if (qy < by0) by0 = qy;
        if (qy > by1) by1 = qy;
        area++;

        const ns = [[qx - 1, qy], [qx + 1, qy], [qx, qy - 1], [qx, qy + 1]];
        for (const [nx, ny] of ns) {
          if (nx < x0 || nx >= width || ny < 0 || ny >= yLimit) continue;
          const ni = idxAt(nx, ny);
          if (seen[ni]) continue;
          seen[ni] = 1;
          const npi = (ny * width + nx) * 4;
          if (isLightLogoPixel(data[npi], data[npi + 1], data[npi + 2])) queue.push(ni);
        }
      }

      const cw = bx1 - bx0 + 1;
      const ch = by1 - by0 + 1;
      const relArea = area / (width * height);
      const aspect = cw / Math.max(1, ch);
      if (
        bx0 / width >= 0.80 &&
        by0 / height <= 0.12 &&
        cw <= maxW &&
        ch <= maxH &&
        cw >= Math.max(6, Math.floor(width * 0.01)) &&
        ch >= Math.max(6, Math.floor(height * 0.01)) &&
        aspect >= 0.55 &&
        aspect <= 1.8 &&
        relArea >= 0.00008 &&
        relArea <= 0.012
      ) {
        const score =
          (1 - Math.abs(1 - aspect)) +
          Math.min(1, relArea / 0.0015) +
          (bx0 / width) * 0.8;
        if (!best || score > best.score) best = { box: { x0: bx0, y0: by0, x1: bx1, y1: by1 }, score };
      }
    }
  }

  if (!best) return null;

  const padX = Math.max(2, Math.floor((best.box.x1 - best.box.x0 + 1) * 0.32));
  const padY = Math.max(2, Math.floor((best.box.y1 - best.box.y0 + 1) * 0.28));
  return clampBox({
    x0: best.box.x0 - padX,
    y0: best.box.y0 - padY,
    x1: best.box.x1 + padX,
    y1: best.box.y1 + padY,
  }, width, height);
}

function clearLogo(
  data: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  logo: Box,
): void {
  for (let y = logo.y0; y <= logo.y1; y++) {
    for (let x = logo.x0; x <= logo.x1; x++) {
      const i = (y * width + x) * 4;
      if (isLightLogoPixel(data[i], data[i + 1], data[i + 2])) {
        mask[y * width + x] = 0;
      }
    }
  }
}

export function normalizeTemplateElements(
  data: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
): TemplateElementStats {
  const header = detectHeader(data, width, height);
  if (header) clearHeaderFill(data, mask, width, height, header);

  const markers = detectColoredMarkers(data, width, height);
  for (const marker of markers) clearMarkerFill(data, mask, width, marker);

  const logo = detectPwLogo(data, width, height);
  if (logo) clearLogo(data, mask, width, logo);

  return {
    headerDetected: header !== null,
    markerCount: markers.length,
    logoDetected: logo !== null,
  };
}
