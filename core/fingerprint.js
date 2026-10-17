// Card Zoom core: picture fingerprints for recognising cards without reading their names.
// A card image is resized to 64x88 RGB, then described by
//   - a 64-bit perceptual hash of the art box (low-frequency DCT of a 32x32 greyscale copy),
//     which survives blur, small sizes and compression, and
//   - 66 bytes of colour layout (4x4 grid over the art, 2x3 over the whole card), normalised
//     so stream brightness and contrast matter less.
// The same code builds the index (Node, tools/build-index.mjs) and matches in the browser,
// so both sides compute identical fingerprints. Exposes window.CardZoom.fingerprint.
(function (root) {
  'use strict';

  const FW = 64, FH = 88;                    // normalised card size
  const ART = { x0: 5, x1: 59, y0: 10, y1: 48 }; // art box of a modern frame, in 64x88 px
  const COLOR_BYTES = 66, RECORD = 8 + COLOR_BYTES;

  const COS = [];
  for (let u = 0; u < 8; u++) {
    COS.push(new Float32Array(32));
    for (let x = 0; x < 32; x++) COS[u][x] = Math.cos(((2 * x + 1) * u * Math.PI) / 64);
  }

  // px: RGB or RGBA bytes of a FW x FH image (stride 3 or 4). Returns Uint8Array(RECORD).
  function describe(px, stride = 4) {
    const N = FW * FH, gray = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const j = i * stride;
      gray[i] = 0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2];
    }
    // Art box resampled to 32x32 (bilinear).
    const g = new Float32Array(32 * 32), aw = ART.x1 - ART.x0, ah = ART.y1 - ART.y0;
    for (let y = 0; y < 32; y++) {
      const sy = ART.y0 + (y + 0.5) * ah / 32 - 0.5, y0 = Math.floor(sy), fy = sy - y0;
      for (let x = 0; x < 32; x++) {
        const sx = ART.x0 + (x + 0.5) * aw / 32 - 0.5, x0 = Math.floor(sx), fx = sx - x0;
        const a = gray[y0 * FW + x0], b = gray[y0 * FW + x0 + 1], c = gray[(y0 + 1) * FW + x0], d = gray[(y0 + 1) * FW + x0 + 1];
        g[y * 32 + x] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
      }
    }
    // 8x8 lowest DCT frequencies (separable), hashed against their median (DC excluded).
    const rows = new Float32Array(32 * 8);
    for (let y = 0; y < 32; y++) for (let u = 0; u < 8; u++) {
      let s = 0; for (let x = 0; x < 32; x++) s += g[y * 32 + x] * COS[u][x];
      rows[y * 8 + u] = s;
    }
    const coef = new Float32Array(64);
    for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
      let s = 0; for (let y = 0; y < 32; y++) s += rows[y * 8 + u] * COS[v][y];
      coef[v * 8 + u] = s;
    }
    const sorted = Array.from(coef.subarray(1)).sort((a, b) => a - b), median = sorted[31];
    const out = new Uint8Array(RECORD);
    for (let i = 0; i < 64; i++) if (coef[i] > median) out[i >> 3] |= 1 << (i & 7);

    // Colour layout: mean RGB per cell, then normalised to mean 128 / spread 40.
    const cells = [];
    const grid = (x0, y0, x1, y1, nx, ny) => {
      for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) {
        const ax = Math.round(x0 + (x1 - x0) * cx / nx), bx = Math.round(x0 + (x1 - x0) * (cx + 1) / nx);
        const ay = Math.round(y0 + (y1 - y0) * cy / ny), by = Math.round(y0 + (y1 - y0) * (cy + 1) / ny);
        const sum = [0, 0, 0]; let n = 0;
        for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) {
          const j = (y * FW + x) * stride; sum[0] += px[j]; sum[1] += px[j + 1]; sum[2] += px[j + 2]; n++;
        }
        cells.push(sum[0] / n, sum[1] / n, sum[2] / n);
      }
    };
    grid(ART.x0, ART.y0, ART.x1, ART.y1, 4, 4);
    grid(0, 0, FW, FH, 2, 3);
    let mean = 0; for (const v of cells) mean += v; mean /= cells.length;
    let sd = 0; for (const v of cells) sd += (v - mean) ** 2; sd = Math.sqrt(sd / cells.length) || 1;
    for (let i = 0; i < COLOR_BYTES; i++) out[8 + i] = Math.max(0, Math.min(255, Math.round(128 + (cells[i] - mean) / sd * 40)));
    return out;
  }

  const POP = new Uint8Array(256);
  for (let i = 0; i < 256; i++) POP[i] = (i & 1) + POP[i >> 1];

  // Lower is closer. Hash bits differ (0-64) plus colour difference scaled to a similar range.
  const COLOR_WEIGHT = 0.25;
  function distance(a, aOff, b, bOff) {
    let ham = 0;
    for (let i = 0; i < 8; i++) ham += POP[a[aOff + i] ^ b[bOff + i]];
    let col = 0;
    for (let i = 8; i < RECORD; i++) col += Math.abs(a[aOff + i] - b[bOff + i]);
    return ham + COLOR_WEIGHT * col / COLOR_BYTES;
  }

  // index: {data: Uint8Array of count*RECORD, meta: [[name, set, number, id], ...]}.
  // Returns the k closest distinct names: [{i, d}], best first.
  function search(index, desc, k = 5, weight = COLOR_WEIGHT) {
    const n = index.meta.length, best = [];
    for (let r = 0; r < n; r++) {
      const off = r * RECORD;
      let ham = 0;
      for (let i = 0; i < 8; i++) ham += POP[desc[i] ^ index.data[off + i]];
      if (best.length === k && ham >= best[k - 1].d) continue; // colour can only add
      let col = 0;
      for (let i = 8; i < RECORD; i++) col += Math.abs(desc[i] - index.data[off + i]);
      const d = ham + weight * col / COLOR_BYTES;
      if (best.length < k || d < best[k - 1].d) {
        const name = index.meta[r][0], dup = best.findIndex((b) => index.meta[b.i][0] === name);
        if (dup >= 0) { if (d < best[dup].d) best.splice(dup, 1); else continue; }
        best.push({ i: r, d }); best.sort((a, b) => a.d - b.d);
        if (best.length > k) best.pop();
      }
    }
    return best;
  }

  // The k closest records (names may repeat), optionally only among the given record numbers.
  function nearest(index, desc, k, weight = COLOR_WEIGHT, among = null) {
    const n = among ? among.length : index.meta.length, best = [];
    for (let j = 0; j < n; j++) {
      const r = among ? among[j] : j, off = r * RECORD;
      let ham = 0;
      for (let i = 0; i < 8; i++) ham += POP[desc[i] ^ index.data[off + i]];
      if (best.length === k && ham >= best[k - 1].d) continue;
      let col = 0;
      for (let i = 8; i < RECORD; i++) col += Math.abs(desc[i] - index.data[off + i]);
      const d = ham + weight * col / COLOR_BYTES;
      if (best.length < k || d < best[k - 1].d) {
        best.push({ i: r, d }); best.sort((a, b) => a.d - b.d);
        if (best.length > k) best.pop();
      }
    }
    return best;
  }

  // Broadcast boxes are loose, tilted and often upside down (cards facing the other player).
  // describeVariant(flip, angle, scale, dx, dy) fingerprints one guess of the card's placement.
  // A few coarse guesses are searched across the whole index to shortlist candidates, then a
  // finer grid of guesses is scored against the shortlist only, and the winning guess is
  // searched in full once more to measure its margin over the next-best card.
  // Returns {i, d, margin, variant}.
  const FINE = { flips: [0, 180], angles: [-10, -5, 0, 5, 10], scales: [0.88, 0.94, 1], shifts: [-0.04, 0, 0.04] };
  const COARSE = { flips: [0, 180], angles: [-6, 0, 6], scales: [0.94] };
  function matchVariants(index, describeVariant, weight = COLOR_WEIGHT, grid = FINE, coarse = COARSE) {
    const short = new Set();
    for (const f of coarse.flips) for (const a of coarse.angles) for (const s of coarse.scales)
      for (const b of nearest(index, describeVariant(f, a, s, 0, 0), 25, weight)) short.add(b.i);
    const among = [...short];
    let best = null;
    for (const f of grid.flips) for (const a of grid.angles) for (const s of grid.scales)
      for (const dx of grid.shifts) for (const dy of grid.shifts) {
        const desc = describeVariant(f, a, s, dx, dy), b = nearest(index, desc, 1, weight, among)[0];
        if (b && (!best || b.d < best.d)) best = { d: b.d, desc, variant: { flip: f, angle: a, scale: s, dx, dy } };
      }
    const top = search(index, best.desc, 2, weight);
    return { i: top[0].i, d: top[0].d, margin: top[1] ? top[1].d - top[0].d : 99, variant: best.variant };
  }

  const api = { FW, FH, RECORD, describe, distance, search, nearest, matchVariants, COLOR_WEIGHT };

  // Browser helpers: fingerprint a region of a video/canvas, load the index files.
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = FW; c.height = FH;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    // rotate: turn a tapped (landscape) crop upright first, counter-clockwise like core/zoom.js.
    api.describeRegion = (src, x, y, w, h, rotate = false) => {
      ctx.save();
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      if (rotate) { ctx.translate(0, FH); ctx.rotate(-Math.PI / 2); ctx.drawImage(src, x, y, w, h, 0, 0, FH, FW); }
      else ctx.drawImage(src, x, y, w, h, 0, 0, FW, FH);
      ctx.restore();
      return describe(ctx.getImageData(0, 0, FW, FH).data, 4);
    };
    // A card centred at (cx, cy), cw x ch in its own upright frame, turned angle degrees clockwise
    // in the source (0 upright, 90 tapped, 180 seen from across the table, or anything between).
    api.describeBox = (src, cx, cy, cw, ch, angle = 0) => {
      const r = Math.ceil(Math.hypot(cw, ch) / 2) + 1;
      const sx = Math.max(0, Math.floor(cx - r)), sy = Math.max(0, Math.floor(cy - r));
      const sw = Math.min((src.videoWidth || src.width) - sx, 2 * r), sh = Math.min((src.videoHeight || src.height) - sy, 2 * r);
      ctx.save();
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, FW, FH);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.translate(FW / 2, FH / 2); ctx.scale(FW / cw, FH / ch); ctx.rotate(-angle * Math.PI / 180); ctx.translate(-cx, -cy);
      if (sw > 0 && sh > 0) ctx.drawImage(src, sx, sy, sw, sh, sx, sy, sw, sh);
      ctx.restore();
      return describe(ctx.getImageData(0, 0, FW, FH).data, 4);
    };
    api.loadIndex = async (base) => {
      const [bin, meta] = await Promise.all([
        fetch(base + '.bin').then((r) => { if (!r.ok) throw new Error('index missing'); return r.arrayBuffer(); }),
        fetch(base + '.json').then((r) => r.json()),
      ]);
      return { data: new Uint8Array(bin), meta: meta.cards, info: meta };
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.CardZoom = root.CardZoom || {}; root.CardZoom.fingerprint = api; }
})(typeof window !== 'undefined' ? window : globalThis);
