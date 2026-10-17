// Card Zoom core: finds card-shaped rectangles in a video frame, with no ML model or library.
// Method: Sobel edges on a frame scaled to 800 px wide -> connected edge blobs -> keep blobs whose bounding
// box has a trading card's proportions (63x88 mm, upright or tapped), whose four sides are
// mostly edge pixels, and which has straight rules across its face (name bar, art box, text box). A tracker smooths results across frames so boxes don't flicker.
// Exposes window.CardZoom.detect.
(function (root) {
  'use strict';

  const CARD = 63 / 88; // width / height of standard TCG cards (Magic, Pokémon, Lorcana, ~Yu-Gi-Oh)
  const mk = (w, h) => {
    const c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(w, h);
    c.width = w; c.height = h; return c;
  };
  let buf = null;

  // source: video/canvas/image. region: {x,y,w,h} in source pixels to search (default: all).
  // Returns [{x,y,w,h,score,rotated}] in source pixels, best first.
  function detectCards(source, region, opts = {}) {
    const sw = source.videoWidth || source.width, sh = source.videoHeight || source.height;
    region = region || { x: 0, y: 0, w: sw, h: sh };
    const {
      analysisWidth = 800, minHeightFrac = 0.05, maxHeightFrac = 0.95,
      aspectTolerance = 0.25, // loose enough for a camera looking at the table at an angle
      minSideEdge = 0.5, minMeanSideEdge = 0.7, minInnerLines = 2, scanMinSide = 0.6, scanMinMean = 0.78,
    } = opts;
    const W = Math.min(analysisWidth, Math.round(region.w)), H = Math.round(region.h * W / region.w);
    if (W < 32 || H < 32) return [];
    if (!buf || buf.width !== W || buf.height !== H) buf = mk(W, H);
    const ctx = buf.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, region.x, region.y, region.w, region.h, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;

    const N = W * H, g = new Float32Array(N);
    for (let i = 0, j = 0; i < N; i++, j += 4) g[i] = 0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2];

    // Sobel magnitude; threshold at the 82nd percentile (min 30) so it adapts to dim or busy streams.
    const mag = new Float32Array(N);
    const hist = new Uint32Array(256);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const gx = g[i - W + 1] + 2 * g[i + 1] + g[i + W + 1] - g[i - W - 1] - 2 * g[i - 1] - g[i + W - 1];
        const gy = g[i + W - 1] + 2 * g[i + W] + g[i + W + 1] - g[i - W - 1] - 2 * g[i - W] - g[i - W + 1];
        const m = Math.min(255, Math.sqrt(gx * gx + gy * gy) / 4);
        mag[i] = m; hist[m | 0]++;
      }
    }
    let acc = 0, t = 255;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= N * 0.82) { t = v; break; } }
    t = Math.max(30, t);

    // Binary edges, dilated once so a card's outline closes into one blob.
    const e0 = new Uint8Array(N), edge = new Uint8Array(N);
    for (let i = 0; i < N; i++) e0[i] = mag[i] >= t ? 1 : 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        edge[i] = e0[i] | e0[i - 1] | e0[i + 1] | e0[i - W] | e0[i + W];
      }
    }

    // Connected components (8-way) -> bounding boxes.
    const label = new Int32Array(N), stack = new Int32Array(N);
    const boxes = [];
    let next = 1;
    for (let s = 0; s < N; s++) {
      if (!edge[s] || label[s]) continue;
      let sp = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
      stack[sp++] = s; label[s] = next;
      while (sp) {
        const i = stack[--sp], x = i % W, y = (i / W) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= W) continue;
            const k = yy * W + xx;
            if (edge[k] && !label[k]) { label[k] = next; stack[sp++] = k; }
          }
        }
      }
      boxes.push({ x0, y0, x1, y1 });
      next++;
    }

    // Fraction of a box side that lies on edge pixels (within +-2 px across the side). Prefix sums
    // over edge maps smeared across each direction make every side test O(1), which is what lets
    // the window scan below try thousands of boxes per frame.
    const rowPS = new Int32Array((W + 1) * H), colPS = new Int32Array(W * (H + 1));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let v = 0; // horizontal sides: any edge within 2 px above or below
        for (let d = -2; d <= 2 && !v; d++) { const yy = y + d; if (yy >= 0 && yy < H && edge[yy * W + x]) v = 1; }
        rowPS[y * (W + 1) + x + 1] = rowPS[y * (W + 1) + x] + v;
      }
    }
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        let v = 0; // vertical sides: any edge within 2 px left or right
        for (let d = -2; d <= 2 && !v; d++) { const xx = x + d; if (xx >= 0 && xx < W && edge[y * W + xx]) v = 1; }
        colPS[x * (H + 1) + y + 1] = colPS[x * (H + 1) + y] + v;
      }
    }
    const sideScore = (ax, ay, bx, by) => {
      ax = Math.max(0, Math.min(W - 1, ax)); bx = Math.max(0, Math.min(W - 1, bx));
      ay = Math.max(0, Math.min(H - 1, ay)); by = Math.max(0, Math.min(H - 1, by));
      if (ay === by) return (rowPS[ay * (W + 1) + bx + 1] - rowPS[ay * (W + 1) + ax]) / (bx - ax + 1);
      return (colPS[ax * (H + 1) + by + 1] - colPS[ax * (H + 1) + ay]) / (by - ay + 1);
    };

    // Counts straight edge lines running across the card's short side, inside its border
    // (rows for an upright card, columns for a tapped one). Adjacent hits count as one line.
    const innerLines = (x0, y0, w, h, tapped) => {
      const along = tapped ? w : h, across = tapped ? h : w;
      const a0 = Math.round(along * 0.06), a1 = Math.round(along * 0.94);
      const c0 = Math.round(across * 0.12), c1 = Math.round(across * 0.88), span = c1 - c0;
      let lines = 0, prev = -9;
      for (let a = a0; a < a1; a++) {
        let hit = 0;
        for (let c = c0; c < c1; c++) {
          const x = tapped ? x0 + a : x0 + c, y = tapped ? y0 + c : y0 + a;
          hit += edge[y * W + x];
        }
        if (hit / span >= 0.65) { if (a - prev > 2) lines++; prev = a; }
      }
      return lines;
    };

    // A box passes if it has card proportions and edges along all four sides.
    const testBox = (x0, y0, w, h) => {
      x0 = Math.round(x0); y0 = Math.round(y0); w = Math.round(w); h = Math.round(h);
      const long = Math.max(w, h), aspectErr = Math.abs(Math.min(w, h) / long - CARD) / CARD;
      if (long < H * minHeightFrac || long > H * maxHeightFrac || aspectErr > aspectTolerance) return null;
      const x1 = x0 + w - 1, y1 = y0 + h - 1;
      const sides = [sideScore(x0, y0, x1, y0), sideScore(x0, y1, x1, y1), sideScore(x0, y0, x0, y1), sideScore(x1, y0, x1, y1)];
      const mean = (sides[0] + sides[1] + sides[2] + sides[3]) / 4;
      if (Math.min(...sides) < minSideEdge || mean < minMeanSideEdge) return null;
      // Webcam boxes and people can be card-shaped; card faces aren't like them inside. Every TCG
      // layout has straight rules across the card (name bar, art box, text box), so require some.
      // Cards under ~60 analysis px (about 13% of the frame height) are too small to check.
      const lines = long >= 60 ? innerLines(x0, y0, w, h, w > h) : minInnerLines;
      if (lines < minInnerLines) return null;
      return { x0, y0, w, h, score: mean * (1 - aspectErr), rotated: w > h };
    };

    let cands = [];
    const debugBoxes = [];
    for (const b of boxes) {
      const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
      if (Math.max(w, h) < H * minHeightFrac) continue;
      if (opts.debug) debugBoxes.push({ x0: b.x0, y0: b.y0, w, h });
      const whole = testBox(b.x0, b.y0, w, h);
      if (whole) { cands.push(whole); continue; }
      // Touching cards merge into one blob: try splitting it into a row or column of equal cards.
      const splits = [
        ['x', Math.round(w / (h * CARD))],  // upright cards side by side
        ['x', Math.round(w * CARD / h)],    // tapped cards side by side
        ['y', Math.round(h * CARD / w)],    // upright cards stacked
      ];
      for (const [axis, n] of splits) {
        if (n < 2 || n > 10) continue;
        const pieces = [];
        for (let k = 0; k < n; k++) {
          const c = axis === 'x' ? testBox(b.x0 + k * w / n, b.y0, w / n, h) : testBox(b.x0, b.y0 + k * h / n, w, h / n);
          if (c) pieces.push(c);
        }
        if (pieces.length) { cands.push(...pieces); break; }
      }
    }

    // Cards touching or overlapping merge into blobs no split can untangle. When the card size is
    // known (from opts.cardHeight, or from several clean detections), slide card-sized boxes over
    // the whole frame and keep those with strong straight edges on all four sides.
    const sizes = cands.map((c) => Math.max(c.w, c.h)).sort((a, b) => a - b);
    const hint = opts.cardHeight ? opts.cardHeight * W / region.w : sizes.length >= 3 ? sizes[sizes.length >> 1] : 0;
    if (hint >= H * minHeightFrac) {
      const found = [];
      for (const k of [0.92, 1, 1.08]) {
        const L = Math.round(hint * k), Sh = Math.round(L * CARD), step = Math.max(2, Math.round(L / 12));
        for (const [w, h] of [[Sh, L], [L, Sh]]) {
          for (let y0 = 0; y0 + h < H; y0 += step) {
            for (let x0 = 0; x0 + w < W; x0 += step) {
              const x1 = x0 + w - 1, y1 = y0 + h - 1;
              const a = sideScore(x0, y0, x1, y0), b = sideScore(x0, y1, x1, y1);
              if (a < scanMinSide || b < scanMinSide) continue;
              const c = sideScore(x0, y0, x0, y1), d = sideScore(x1, y0, x1, y1);
              if (c < scanMinSide || d < scanMinSide) continue;
              const mean = (a + b + c + d) / 4;
              if (mean >= scanMinMean) found.push({ x0, y0, w, h, score: mean, rotated: w > h });
            }
          }
        }
      }
      // Each card produces a cluster of nearby hits: refine each to its local best.
      found.sort((p, q) => q.score - p.score);
      for (const f of found) {
        if (cands.some((c) => iou(f, c) > 0.3)) continue;
        cands.push(f);
      }
    }

    // Drop boxes inside a better or bigger box (e.g. a card's art frame inside the card).
    cands.sort((a, b) => b.w * b.h - a.w * a.h);
    const kept = [];
    for (const c of cands) {
      if (kept.some((k) => overlap(c, k) > 0.6)) continue;
      kept.push(c);
    }
    const kx = region.w / W, ky = region.h / H;
    const out = kept.sort((a, b) => b.score - a.score).map((c) => ({
      x: region.x + c.x0 * kx, y: region.y + c.y0 * ky, w: c.w * kx, h: c.h * ky, score: c.score, rotated: c.rotated,
    }));
    // opts.debug: attach the edge map and boxes (analysis pixels) so a page can show what was seen.
    if (opts.debug) out.debug = { W, H, edge, blobs: debugBoxes, kept };
    return out;
  }

  // Share of a's area covered by b (boxes as {x0,y0,w,h} or {x,y,w,h}).
  function overlap(a, b) {
    const ax = a.x0 ?? a.x, ay = a.y0 ?? a.y, bx = b.x0 ?? b.x, by = b.y0 ?? b.y;
    const ix = Math.max(0, Math.min(ax + a.w, bx + b.w) - Math.max(ax, bx));
    const iy = Math.max(0, Math.min(ay + a.h, by + b.h) - Math.max(ay, by));
    return (ix * iy) / (a.w * a.h);
  }
  const iou = (a, b) => {
    const i = overlap(a, b) * a.w * a.h;
    return i / (a.w * a.h + b.w * b.h - i);
  };

  // Keeps detections stable across frames: a card must be seen `confirm` times to show,
  // and survives `patience` missed frames. Each track keeps a stable id.
  function createTracker({ confirm = 2, patience = 3, smooth = 0.5 } = {}) {
    let tracks = [], nextId = 1;
    return {
      update(dets) {
        const used = new Set();
        for (const tr of tracks) {
          let best = -1, bestIou = 0.35;
          dets.forEach((d, i) => { if (!used.has(i)) { const v = iou(tr, d); if (v > bestIou) { bestIou = v; best = i; } } });
          if (best >= 0) {
            const d = dets[best]; used.add(best);
            for (const k of ['x', 'y', 'w', 'h']) tr[k] = tr[k] * smooth + d[k] * (1 - smooth);
            tr.score = d.score; tr.rotated = d.rotated; tr.obb = d.obb; tr.hits++; tr.missed = 0;
          } else tr.missed++;
        }
        dets.forEach((d, i) => { if (!used.has(i)) tracks.push({ ...d, id: nextId++, hits: 1, missed: 0, born: Date.now() }); });
        tracks = tracks.filter((t) => t.missed <= patience);
        return this.visible();
      },
      visible() { return tracks.filter((t) => t.hits >= confirm); },
      remove(id) { tracks = tracks.filter((t) => t.id !== id); },
      reset() { tracks = []; },
    };
  }

  root.CardZoom = root.CardZoom || {};
  root.CardZoom.detect = { detectCards, createTracker, iou };
})(typeof window !== 'undefined' ? window : self);
