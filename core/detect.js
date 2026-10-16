// Card Zoom core: finds card-shaped rectangles in a video frame, with no ML model or library.
// Method: Sobel edges on a downscaled frame -> connected edge blobs -> keep blobs whose bounding
// box has a trading card's proportions (63x88 mm, upright or tapped) and whose four sides are
// mostly edge pixels. A tracker smooths results across frames so boxes don't flicker.
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
      analysisWidth = 480, minHeightFrac = 0.07, maxHeightFrac = 0.95,
      aspectTolerance = 0.16, minSideEdge = 0.4, minMeanSideEdge = 0.6,
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

    // Fraction of a box side that lies on edge pixels (searching +-2 px across the side).
    const sideScore = (ax, ay, bx, by) => {
      const len = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) + 1;
      const horiz = ay === by;
      let hit = 0;
      for (let k = 0; k < len; k++) {
        const x = horiz ? ax + k : ax, y = horiz ? ay : ay + k;
        let ok = 0;
        for (let d = -2; d <= 2 && !ok; d++) {
          const xx = horiz ? x : x + d, yy = horiz ? y + d : y;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && edge[yy * W + xx]) ok = 1;
        }
        hit += ok;
      }
      return hit / len;
    };

    let cands = [];
    for (const b of boxes) {
      const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
      const short = Math.min(w, h), long = Math.max(w, h);
      if (long < H * minHeightFrac || long > H * maxHeightFrac) continue;
      const ratio = short / long;
      const aspectErr = Math.abs(ratio - CARD) / CARD;
      if (aspectErr > aspectTolerance) continue;
      const sides = [sideScore(b.x0, b.y0, b.x1, b.y0), sideScore(b.x0, b.y1, b.x1, b.y1),
        sideScore(b.x0, b.y0, b.x0, b.y1), sideScore(b.x1, b.y0, b.x1, b.y1)];
      const mean = (sides[0] + sides[1] + sides[2] + sides[3]) / 4;
      if (Math.min(...sides) < minSideEdge || mean < minMeanSideEdge) continue;
      cands.push({ x0: b.x0, y0: b.y0, w, h, score: mean * (1 - aspectErr), rotated: w > h });
    }

    // Drop boxes inside a better or bigger box (e.g. a card's art frame inside the card).
    cands.sort((a, b) => b.w * b.h - a.w * a.h);
    const kept = [];
    for (const c of cands) {
      if (kept.some((k) => overlap(c, k) > 0.6)) continue;
      kept.push(c);
    }
    const kx = region.w / W, ky = region.h / H;
    return kept.sort((a, b) => b.score - a.score).map((c) => ({
      x: region.x + c.x0 * kx, y: region.y + c.y0 * ky, w: c.w * kx, h: c.h * ky, score: c.score, rotated: c.rotated,
    }));
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
            tr.score = d.score; tr.rotated = d.rotated; tr.hits++; tr.missed = 0;
          } else tr.missed++;
        }
        dets.forEach((d, i) => { if (!used.has(i)) tracks.push({ ...d, id: nextId++, hits: 1, missed: 0, born: Date.now() }); });
        tracks = tracks.filter((t) => t.missed <= patience);
        return this.visible();
      },
      visible() { return tracks.filter((t) => t.hits >= confirm); },
      reset() { tracks = []; },
    };
  }

  root.CardZoom = root.CardZoom || {};
  root.CardZoom.detect = { detectCards, createTracker, iou };
})(typeof window !== 'undefined' ? window : self);
