// Card Zoom core: maps a selection to video pixels and renders an enlarged, cleaned-up crop.
// No DOM lookups or page state here, so the same file can run in a web page, an extension
// content script, or an app webview. Exposes window.CardZoom.zoom.
(function (root) {
  'use strict';

  function clampRect(x, y, w, h, vw, vh) {
    x = Math.max(0, Math.min(x, vw - 1)); y = Math.max(0, Math.min(y, vh - 1));
    return { x, y, w: Math.max(1, Math.min(w, vw - x)), h: Math.max(1, Math.min(h, vh - y)) };
  }

  // sel: {x,y,w,h} as fractions of the element the user dragged over (the "stage").
  // frame: how the video frame relates to that element:
  //   'contain'  - the frame is drawn inside the stage with object-fit: contain (a <video>)
  //   'stage'    - the frame is exactly the stage (tab capture cropped to the stage)
  //   'viewport' - the frame is the whole browser viewport (uncropped tab capture)
  // stageRect: the stage's getBoundingClientRect(); viewport: {width, height} in CSS px.
  function mapSelection({ sel, videoW: vw, videoH: vh, frame, stageRect: r, viewport }) {
    if (!vw || !vh) return null;
    if (frame === 'stage') return clampRect(sel.x * vw, sel.y * vh, sel.w * vw, sel.h * vh, vw, vh);
    if (frame === 'contain') {
      const scale = Math.min(r.width / vw, r.height / vh);
      const ox = (r.width - vw * scale) / 2, oy = (r.height - vh * scale) / 2;
      return clampRect((sel.x * r.width - ox) / scale, (sel.y * r.height - oy) / scale,
        sel.w * r.width / scale, sel.h * r.height / scale, vw, vh);
    }
    const kx = vw / viewport.width, ky = vh / viewport.height;
    return clampRect((r.left + sel.x * r.width) * kx, (r.top + sel.y * r.height) * ky,
      sel.w * r.width * kx, sel.h * r.height * ky, vw, vh);
  }

  // A click instead of a drag: a card-shaped (63:88) box centred on the point.
  function clickToSelection(px, py, stageW, stageH, heightFrac = 0.22) {
    const h = stageH * heightFrac, w = h * 63 / 88;
    return { x: px - w / 2, y: py - h / 2, w, h };
  }

  // Unsharp mask: out = src + amount * (src - blur(src)), 3x3 box blur.
  function sharpen(ctx, w, h, amount = 0.6) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data, src = new Uint8ClampedArray(d);
    const W = w * 4;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * W + x * 4;
        for (let c = 0; c < 3; c++) {
          const k = i + c;
          const blur = (src[k - W - 4] + src[k - W] + src[k - W + 4] + src[k - 4] + src[k] + src[k + 4] +
            src[k + W - 4] + src[k + W] + src[k + W + 4]) / 9;
          d[k] = src[k] + amount * (src[k] - blur);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  const work = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1);

  // Draws rect of source (video, canvas or image) into out, scaled to fit maxW x maxH device px
  // but never less than minScale. Throws if the source is cross-origin and unreadable.
  function renderCrop(source, rect, out, { maxW, maxH, minScale = 3, rotate = false, sharpen: sh = true, contrast = false } = {}) {
    const sw = rotate ? rect.h : rect.w, sh2 = rotate ? rect.w : rect.h;
    const fit = Math.max(minScale, Math.min(maxW / sw, maxH / sh2));
    const outW = Math.round(sw * fit), outH = Math.round(sh2 * fit);

    // Two-step upscale (source -> 2x -> final) looks smoother than one big jump.
    work.width = Math.round(rect.w * 2); work.height = Math.round(rect.h * 2);
    const wctx = work.getContext('2d');
    wctx.imageSmoothingEnabled = true; wctx.imageSmoothingQuality = 'high';
    wctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, work.width, work.height);

    out.width = outW; out.height = outH;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (contrast) ctx.filter = 'contrast(1.25) saturate(1.15)';
    // Turn counter-clockwise: tapped cards are turned clockwise, so this stands them upright.
    if (rotate) { ctx.translate(0, outH); ctx.rotate(-Math.PI / 2); ctx.drawImage(work, 0, 0, outH, outW); }
    else ctx.drawImage(work, 0, 0, outW, outH);
    ctx.restore();
    if (sh) sharpen(ctx, outW, outH);
    return { width: outW, height: outH };
  }

  // Most TCGs print the name in the top band of the card: grayscale, high-contrast copy of it for OCR.
  function nameBand(card) {
    const band = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1);
    const bh = Math.round(card.height * 0.14);
    band.width = card.width; band.height = bh;
    const b = band.getContext('2d');
    b.filter = 'grayscale(1) contrast(1.6)';
    b.drawImage(card, 0, Math.round(card.height * 0.02), card.width, bh, 0, 0, card.width, bh);
    return band;
  }

  root.CardZoom = root.CardZoom || {};
  root.CardZoom.zoom = { mapSelection, clickToSelection, renderCrop, sharpen, nameBand, clampRect };
})(typeof window !== 'undefined' ? window : self);
