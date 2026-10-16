// Card Zoom core: picks which database result is the card on screen by comparing pictures.
// A name search returns many printings (and, across games, many cards); each candidate's scan is
// shrunk to a tiny thumbnail and compared with the stream crop after evening out brightness and
// contrast, so stream lighting matters less. Exposes window.CardZoom.match.
(function (root) {
  'use strict';

  const GW = 12, GH = 17; // comparison grid, card proportions
  const mk = () => {
    const c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(GW, GH);
    c.width = GW; c.height = GH; return c;
  };

  // Tiny normalised RGB signature of a card image (canvas, image or video frame region).
  function signature(src, sx = 0, sy = 0, sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height) {
    const c = mk(), ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, GW, GH);
    const d = ctx.getImageData(0, 0, GW, GH).data, n = GW * GH, out = new Float32Array(n * 3);
    // One mean and spread for all channels: evens out brightness and contrast but keeps colour,
    // so a red card and a yellow card with the same frame layout still look different.
    let sum = 0, sq = 0;
    for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) { const v = d[i * 4 + ch]; sum += v; sq += v * v; }
    const mean = sum / (n * 3), sd = Math.sqrt(Math.max(1, sq / (n * 3) - mean * mean));
    for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) out[i * 3 + ch] = (d[i * 4 + ch] - mean) / sd;
    return out;
  }

  // 1 = identical after normalising, around 0 = unrelated (correlation of the two signatures).
  function similarity(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s / a.length;
  }

  function loadImage(url) {
    return new Promise((ok, fail) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => ok(im);
      im.onerror = () => fail(new Error('image failed: ' + url));
      im.src = url;
    });
  }

  // crop: canvas of the card from the stream, upright. candidates: lookup results ({img, ...}).
  // Returns candidates with a .match score, best first. Candidates whose scans can't be read
  // (no CORS) keep their search order behind the scored ones.
  async function rankByLook(crop, candidates, max = 12) {
    const target = signature(crop);
    const scored = await Promise.all(candidates.slice(0, max).map(async (c) => {
      try { return { ...c, match: similarity(target, signature(await loadImage(c.img))) }; }
      catch { return { ...c, match: null }; }
    }));
    const ok = scored.filter((c) => c.match !== null).sort((a, b) => b.match - a.match);
    return ok.concat(scored.filter((c) => c.match === null), candidates.slice(max));
  }

  root.CardZoom = root.CardZoom || {};
  root.CardZoom.match = { signature, similarity, rankByLook, loadImage };
})(typeof window !== 'undefined' ? window : self);
