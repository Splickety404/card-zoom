// Card Zoom core: trained card detector (YOLO11n-OBB, built by tools/detector/train.py from
// synthetic tables). Finds cards in fanned stacks, overlapping piles and at any angle, which the
// edge-based detector in detect.js can't separate. Runs with ONNX Runtime Web (WebAssembly),
// loaded on first use from vendor/ort/ next to the page (or a CDN if that copy is missing).
// Exposes window.CardZoom.cardnet.
//
// detect(source, region) resolves to the same shape as detect.detectCards (x, y, w, h, rotated,
// score, in source pixels) plus `obb`: {cx, cy, cw, ch, angle} with cw/ch the card's own upright
// size and angle its clockwise turn in degrees (modulo 180: upside down is left to the matcher).
(function (root) {
  'use strict';

  // The WebAssembly-only build: half the download of the full one, and no WebGPU code.
  let ortUrls = ['vendor/ort/ort.wasm.min.js', 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.wasm.min.js'];
  let worker = null, loading = null, size = 640, ready = false, nextId = 0;
  const pending = new Map();
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;

  // The network takes a few hundred milliseconds per frame, so it runs in a worker to keep the
  // page responsive. The worker is made from a string so this file stays a plain classic script.
  const WORKER = `
    let session;
    self.onmessage = async (e) => {
      const m = e.data;
      try {
        if (m.type === 'load') {
          if (typeof ort === 'undefined') importScripts(m.ortUrl);
          ort.env.wasm.wasmPaths = m.ortUrl.replace(/[^/]*$/, '');
          ort.env.wasm.numThreads = 1;
          session = await ort.InferenceSession.create(m.modelUrl, { executionProviders: ['wasm'] });
          const dims = session.inputMetadata && session.inputMetadata[0] && session.inputMetadata[0].shape;
          postMessage({ id: m.id, size: dims && typeof dims[2] === 'number' ? dims[2] : 640 });
        } else {
          const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', m.data, [1, 3, m.size, m.size]) });
          const t = out[session.outputNames[0]];
          postMessage({ id: m.id, dims: t.dims, data: t.data }, [t.data.buffer]);
        }
      } catch (err) { postMessage({ id: m.id, error: String(err && err.message || err) }); }
    };`;
  function call(msg, transfer) {
    return new Promise((ok, fail) => {
      const id = ++nextId;
      pending.set(id, { ok, fail });
      worker.postMessage({ ...msg, id }, transfer || []);
    });
  }

  function load(modelUrl) {
    if (!loading) {
      loading = (async () => {
        worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })));
        worker.onmessage = (e) => {
          const p = pending.get(e.data.id);
          if (!p) return;
          pending.delete(e.data.id);
          e.data.error ? p.fail(new Error(e.data.error)) : p.ok(e.data);
        };
        const model = new URL(modelUrl, location.href).href;
        let r, err;
        for (const u of ortUrls) {
          try { r = await call({ type: 'load', ortUrl: new URL(u, location.href).href, modelUrl: model }); break; } catch (e) { err = e; }
        }
        if (!r) throw err;
        size = r.size; ready = true;
      })().catch((e) => { loading = null; if (worker) worker.terminate(); worker = null; throw e; });
    }
    return loading;
  }

  // Corners of a rotated box, for overlap tests.
  function corners(b) {
    const c = Math.cos(b.a), s = Math.sin(b.a), hw = b.w / 2, hh = b.h / 2;
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [b.cx + x * c - y * s, b.cy + x * s + y * c]);
  }
  function area(p) { let s = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; s += x1 * y2 - x2 * y1; } return Math.abs(s) / 2; }
  // Intersection of two convex polygons (Sutherland-Hodgman).
  function clip(subject, clipper) {
    let out = subject;
    for (let i = 0; i < clipper.length && out.length; i++) {
      const [ax, ay] = clipper[i], [bx, by] = clipper[(i + 1) % clipper.length];
      const inside = ([x, y]) => (bx - ax) * (y - ay) - (by - ay) * (x - ax) >= 0;
      const cross = (p, q) => {
        const [x1, y1] = p, [x2, y2] = q, dx = x2 - x1, dy = y2 - y1;
        const t = ((ax - x1) * (by - ay) - (ay - y1) * (bx - ax)) / (dx * (by - ay) - dy * (bx - ax));
        return [x1 + t * dx, y1 + t * dy];
      };
      const input = out; out = [];
      for (let j = 0; j < input.length; j++) {
        const p = input[j], q = input[(j + 1) % input.length];
        if (inside(q)) { if (!inside(p)) out.push(cross(p, q)); out.push(q); } else if (inside(p)) out.push(cross(p, q));
      }
    }
    return out;
  }
  function rotatedIou(a, b) {
    const pa = corners(a), pb = corners(b), inter = area(clip(pa, pb));
    return inter / (a.w * a.h + b.w * b.h - inter);
  }

  async function detect(source, region, { minScore = 0.35, iouThreshold = 0.5 } = {}) {
    if (!ready) throw new Error('model not loaded');
    const vw = source.videoWidth || source.width, vh = source.videoHeight || source.height;
    region = region || { x: 0, y: 0, w: vw, h: vh };
    // Letterbox the region into size x size, like the training pipeline.
    const k = Math.min(size / region.w, size / region.h);
    const dw = Math.round(region.w * k), dh = Math.round(region.h * k);
    const ox = Math.floor((size - dw) / 2), oy = Math.floor((size - dh) / 2);
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = 'rgb(114,114,114)'; ctx.fillRect(0, 0, size, size);
    ctx.drawImage(source, region.x, region.y, region.w, region.h, ox, oy, dw, dh);
    const px = ctx.getImageData(0, 0, size, size).data, N = size * size;
    const input = new Float32Array(3 * N);
    for (let i = 0; i < N; i++) {
      input[i] = px[i * 4] / 255; input[N + i] = px[i * 4 + 1] / 255; input[2 * N + i] = px[i * 4 + 2] / 255;
    }
    const t = await call({ type: 'run', data: input, size }, [input.buffer]), [, ch, n] = t.dims, d = t.data;
    // Rows: cx, cy, w, h, score (one class), angle in radians.
    const cand = [];
    for (let i = 0; i < n; i++) {
      const score = d[4 * n + i];
      if (score < minScore) continue;
      cand.push({ cx: d[i], cy: d[n + i], w: d[2 * n + i], h: d[3 * n + i], a: d[(ch - 1) * n + i], score });
    }
    cand.sort((p, q) => q.score - p.score);
    const kept = [];
    for (const c of cand) if (!kept.some((k2) => rotatedIou(k2, c) > iouThreshold)) kept.push(c);
    return kept.map((b) => {
      const cx = region.x + (b.cx - ox) / k, cy = region.y + (b.cy - oy) / k, w = b.w / k, h = b.h / k;
      const ps = corners({ cx, cy, w, h, a: b.a });
      const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]);
      const x0 = Math.max(0, Math.min(...xs)), y0 = Math.max(0, Math.min(...ys));
      const x1 = Math.min(vw, Math.max(...xs)), y1 = Math.min(vh, Math.max(...ys));
      // Upright card size and its turn: the long side is the card's height.
      let deg = b.a * 180 / Math.PI, cw = w, chh = h;
      if (w > h) { cw = h; chh = w; deg += 90; }
      deg = ((deg % 180) + 180) % 180;
      const rotated = deg > 45 && deg < 135;
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, rotated, score: b.score, obb: { cx, cy, cw, ch: chh, angle: deg } };
    });
  }

  root.CardZoom = root.CardZoom || {};
  root.CardZoom.cardnet = { load, detect, ready: () => ready, setOrtUrl: (u) => { ortUrls = [u]; }, rotatedIou };
})(typeof window !== 'undefined' ? window : self);
