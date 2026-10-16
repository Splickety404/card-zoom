// Card Zoom core: reads a card name from a zoomed crop with Tesseract.js, loaded on first use.
// Exposes window.CardZoom.ocr. Note for an extension: Manifest V3 forbids remote scripts,
// so bundle tesseract.js locally and point TESSERACT_URL at the packaged copy.
(function (root) {
  'use strict';

  let TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  let worker = null;

  function loadWorker() {
    if (worker) return worker;
    worker = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = TESSERACT_URL;
      s.onload = async () => {
        try {
          const w = await root.Tesseract.createWorker('eng');
          await w.setParameters({ tessedit_pageseg_mode: '7' }); // treat the image as one line of text
          ok(w);
        } catch (e) { fail(e); }
      };
      s.onerror = () => fail(new Error('Could not load the text reader.'));
      document.head.appendChild(s);
    });
    worker.catch(() => { worker = null; });
    return worker;
  }

  // Picks the most name-like line from OCR text: letters only, drops HP/level/stage noise.
  function bestLine(text) {
    return text.split('\n')
      .map((l) => l.replace(/[^A-Za-z0-9'’,\- é]/g, ' ').replace(/\s+/g, ' ').trim())
      .map((l) => l.replace(/\b\d+\b/g, '').replace(/\b(HP|LV|STAGE ?\d?|BASIC)\b/gi, '').replace(/\s+/g, ' ').trim())
      .filter((l) => (l.match(/[A-Za-z]/g) || []).length >= 3)
      .sort((a, b) => b.length - a.length)[0] || '';
  }

  // Black text on white at ~80 px tall reads best: rescale the band, then Otsu threshold it.
  function prepare(band) {
    const scale = Math.min(4, Math.max(1, 80 / band.height));
    const c = document.createElement('canvas');
    c.width = Math.round(band.width * scale); c.height = Math.round(band.height * scale);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(band, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data, hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
    const n = d.length / 4;
    let sum = 0; for (let v = 0; v < 256; v++) sum += v * hist[v];
    let wB = 0, sB = 0, best = 0, t = 128;
    for (let v = 0; v < 256; v++) {
      wB += hist[v]; if (!wB || wB === n) continue;
      sB += v * hist[v];
      const mB = sB / wB, mF = (sum - sB) / (n - wB), between = wB * (n - wB) * (mB - mF) ** 2;
      if (between > best) { best = between; t = v; }
    }
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < t) dark++;
    const invert = dark > n / 2; // light text on a dark title bar: flip so text is black
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] < t) !== invert ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // card: a canvas holding the zoomed card. Returns the guessed name, or ''.
  async function readCardName(card) {
    const w = await loadWorker();
    const { data } = await w.recognize(prepare(root.CardZoom.zoom.nameBand(card)));
    return bestLine(data.text);
  }

  root.CardZoom = root.CardZoom || {};
  root.CardZoom.ocr = { readCardName, bestLine, setTesseractUrl: (u) => { TESSERACT_URL = u; } };
})(typeof window !== 'undefined' ? window : self);
