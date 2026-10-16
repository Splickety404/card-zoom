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
      s.onload = async () => { try { ok(await root.Tesseract.createWorker('eng')); } catch (e) { fail(e); } };
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

  // card: a canvas holding the zoomed card. Returns the guessed name, or ''.
  async function readCardName(card) {
    const w = await loadWorker();
    const { data } = await w.recognize(root.CardZoom.zoom.nameBand(card));
    return bestLine(data.text);
  }

  root.CardZoom = root.CardZoom || {};
  root.CardZoom.ocr = { readCardName, bestLine, setTesseractUrl: (u) => { TESSERACT_URL = u; } };
})(typeof window !== 'undefined' ? window : self);
