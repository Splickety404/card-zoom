// Card Zoom web page: wires the page's controls to the reusable core (core/*.js).
// Everything specific to this page (embeds, buttons, panels) lives here; an extension or app
// would replace this file and keep core/ as is.
(function () {
'use strict';
const { zoom: Z, detect: D, lookup: L, ocr: O, match: M } = window.CardZoom;
const $ = (id) => document.getElementById(id);
const stage = $('stage'), overlay = $('overlay'), selbox = $('selbox'), marks = $('marks');
const zoom = $('zoom');

const S = {
  embed: null,        // iframe for a YouTube/Twitch embed
  video: null,        // <video> whose frames we can read (direct video, or the capture stream)
  kind: null,         // 'direct' | 'capture'
  cropped: false,     // capture track cropped to #stage via Region Capture
  auto: true,         // automatic card spotting on
  tracks: [],         // cards currently spotted (source pixel boxes with stable ids)
  focusId: null,      // track shown in the zoom
  pinnedId: null,     // track the viewer clicked; otherwise the zoom follows the biggest card
  manual: null,       // manual selection, stage-relative fractions {x,y,w,h}
  live: false,
  identified: new Set(), // track ids already sent to OCR
  ids: new Map(),     // track id (or 'manual') -> {card, ranked}: what the card was identified as
  view: 'official',   // zoom shows the official scan when we have one, else the stream crop
  history: [],
};
const tracker = D.createTracker();

function status(msg) { $('status').textContent = msg; }

// ---------- Loading sources ----------
function parseSource(raw) {
  let u;
  try { u = new URL(raw.trim()); } catch { return null; }
  const h = u.hostname.replace(/^www\.|^m\./, '');
  if (h === 'youtu.be') return { type: 'youtube', id: u.pathname.slice(1) };
  if (h.endsWith('youtube.com')) {
    const id = u.searchParams.get('v') || (u.pathname.match(/\/(?:live|embed|shorts)\/([\w-]+)/) || [])[1];
    if (id) return { type: 'youtube', id, t: u.searchParams.get('t') };
  }
  if (h.endsWith('twitch.tv')) {
    const p = u.pathname.split('/').filter(Boolean);
    if (p[0] === 'videos' && p[1]) return { type: 'twitch', video: p[1] };
    if (h.startsWith('clips.') && p[0]) return { type: 'twitch', clip: p[0] };
    if (p[1] === 'clip' && p[2]) return { type: 'twitch', clip: p[2] };
    if (p[0]) return { type: 'twitch', channel: p[0] };
  }
  if (/\.(mp4|webm|ogv|mov)(\?|$)/i.test(u.pathname)) return { type: 'direct', src: u.href };
  return null;
}

function resetSpotting() {
  tracker.reset(); S.tracks = []; S.focusId = S.pinnedId = null; S.identified.clear(); S.ids.clear();
  renderSpotted(); renderMarks();
}

function clearStage() {
  stopLive();
  if (S.embed) S.embed.remove();
  S.embed = null;
  if (S.kind === 'direct') { S.video.remove(); S.video = null; S.kind = null; }
  $('empty').hidden = true;
  S.manual = null;
  resetSpotting();
}

function loadEmbed(src) {
  clearStage();
  stage.style.aspectRatio = '16 / 9';
  const f = document.createElement('iframe');
  f.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
  f.allowFullscreen = true;
  if (src.type === 'youtube') {
    const t = src.t ? '&start=' + parseInt(src.t, 10) : '';
    f.src = `https://www.youtube.com/embed/${encodeURIComponent(src.id)}?autoplay=1&playsinline=1&rel=0${t}`;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
  } else {
    const parent = location.hostname || 'localhost';
    const base = src.clip ? `https://clips.twitch.tv/embed?clip=${encodeURIComponent(src.clip)}`
      : src.video ? `https://player.twitch.tv/?video=${encodeURIComponent(src.video)}`
      : `https://player.twitch.tv/?channel=${encodeURIComponent(src.channel)}`;
    f.src = `${base}&parent=${encodeURIComponent(parent)}&autoplay=true`;
  }
  stage.insertBefore(f, marks);
  S.embed = f;
  if (location.protocol === 'file:') status('Embeds need the page served from a web server (see README). "Open video file" works without one.');
  else status(S.kind === 'capture' ? 'Capturing. Watching for cards.' : 'Press "Start capture" and choose this tab so the page can see the video.');
  updateButtons();
}

function useVideoElement(v) {
  v.className = 'src';
  stage.insertBefore(v, marks);
  if (S.kind === 'capture') stopCapture(true);
  S.video = v; S.kind = 'direct';
  updateButtons();
}

function loadDirect(url) {
  clearStage();
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous';
  v.controls = true; v.autoplay = true; v.muted = true; v.playsInline = true; v.loop = true;
  v.src = url;
  v.addEventListener('loadedmetadata', () => {
    stage.style.aspectRatio = `${v.videoWidth} / ${v.videoHeight}`;
    status(`Video ${v.videoWidth}×${v.videoHeight}. Watching for cards.`);
  });
  v.addEventListener('error', () => status('That video could not be loaded. Its host may block reading it; try Start capture instead.'));
  useVideoElement(v);
}

$('load').onclick = () => {
  const src = parseSource($('url').value);
  if (!src) return status('Could not recognise that link. Paste a YouTube, Twitch or direct video URL.');
  src.type === 'direct' ? loadDirect(src.src) : loadEmbed(src);
};
$('url').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('load').click(); });
$('fileBtn').onclick = () => $('file').click();
$('file').onchange = () => { const f = $('file').files[0]; if (f) loadDirect(URL.createObjectURL(f)); };

// ---------- Screen capture: the only way a page can read pixels from a YouTube/Twitch embed ----------
async function startCapture() {
  if (!navigator.mediaDevices?.getDisplayMedia) return status('This browser cannot capture a tab. Try desktop Chrome, Edge or Firefox.');
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser', frameRate: 30, width: { ideal: 3840 }, height: { ideal: 2160 } },
      audio: false, preferCurrentTab: true, selfBrowserSurface: 'include',
    });
  } catch { return status('Capture was cancelled.'); }
  const track = stream.getVideoTracks()[0];
  S.cropped = false;
  // Region Capture (Chrome/Edge): crop the tab capture to just the video area.
  if (window.CropTarget && track.cropTo && track.getSettings().displaySurface === 'browser') {
    try { await track.cropTo(await CropTarget.fromElement(stage)); S.cropped = true; } catch { /* a different tab was picked */ }
  }
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.srcObject = stream;
  await v.play().catch(() => {});
  S.video = v; S.kind = 'capture';
  resetSpotting();
  track.addEventListener('ended', () => stopCapture());
  status(S.cropped ? `Capturing the video (${v.videoWidth}×${v.videoHeight}). Watching for cards.`
    : 'Capturing. If you picked another tab or window, boxes will be off: pick "this tab".');
  updateButtons();
}
function stopCapture(quiet) {
  if (S.kind !== 'capture') return;
  S.video.srcObject?.getTracks().forEach((t) => t.stop());
  S.video = null; S.kind = null; stopLive(); resetSpotting();
  if (!quiet) status('Capture stopped.');
  updateButtons();
}
$('capture').onclick = () => (S.kind === 'capture' ? stopCapture() : startCapture());

function updateButtons() {
  const ready = !!S.video;
  $('capture').textContent = S.kind === 'capture' ? 'Stop capture' : 'Start capture';
  $('capture').classList.toggle('on', S.kind === 'capture');
  // With an embed, nothing can be spotted until the viewer shares the tab: make that the obvious next step.
  const needCapture = !!S.embed && S.kind !== 'capture';
  $('capture').classList.toggle('nudge', needCapture);
  $('spottedEmpty').textContent = needCapture
    ? 'Press Start capture and choose "This tab" so the page can see the video.'
    : ready ? 'Watching for cards…' : 'No cards spotted yet.';
  $('selectMode').disabled = !ready;
  $('live').disabled = !ready || !currentRect();
  if (!ready) setSelectMode(false);
}

// ---------- Geometry: stage <-> source video pixels ----------
function frameInfo() {
  const v = S.video;
  return {
    videoW: v.videoWidth, videoH: v.videoHeight, stageRect: stage.getBoundingClientRect(),
    frame: S.kind === 'direct' ? 'contain' : S.cropped ? 'stage' : 'viewport',
    viewport: { width: window.innerWidth, height: window.innerHeight },
  };
}
// The part of the source frame that shows the stage.
function stageRegion() {
  const f = frameInfo();
  return Z.mapSelection({ ...f, sel: { x: 0, y: 0, w: 1, h: 1 } });
}
// Source pixel box -> CSS px relative to the stage (for drawing marks).
function toStage(b) {
  const { videoW: vw, videoH: vh, stageRect: r, frame } = frameInfo();
  if (frame === 'stage') return { x: b.x / vw * r.width, y: b.y / vh * r.height, w: b.w / vw * r.width, h: b.h / vh * r.height };
  if (frame === 'contain') {
    const s = Math.min(r.width / vw, r.height / vh), ox = (r.width - vw * s) / 2, oy = (r.height - vh * s) / 2;
    return { x: ox + b.x * s, y: oy + b.y * s, w: b.w * s, h: b.h * s };
  }
  const kx = vw / window.innerWidth, ky = vh / window.innerHeight;
  return { x: b.x / kx - r.left, y: b.y / ky - r.top, w: b.w / kx, h: b.h / ky };
}

// What the zoom shows: a manual box, or the focused spotted card. Source pixels.
function currentRect() {
  if (!S.video || !S.video.videoWidth) return null;
  if (S.manual) return Z.mapSelection({ ...frameInfo(), sel: S.manual });
  const t = S.tracks.find((t) => t.id === S.focusId);
  return t ? Z.clampRect(t.x, t.y, t.w, t.h, S.video.videoWidth, S.video.videoHeight) : null;
}

// ---------- Automatic spotting ----------
const DETECT_MS = 350;
setInterval(() => {
  if (!S.auto || !S.video || !S.video.videoWidth || document.hidden) return;
  const region = stageRegion();
  if (!region) return;
  let dets;
  const debug = $('dbg').checked;
  try { dets = D.detectCards(S.video, region, { debug }); } catch { return status('The browser blocked reading this video. Use Start capture instead.'); }
  S.tracks = tracker.update(dets);
  if (debug) drawDebug(dets.debug);
  chooseFocus();
  renderMarks(); renderSpotted();
  if (!S.manual) renderZoom(false);
  maybeIdentify();
}, DETECT_MS);

// Detector view: edge map in grey, blobs considered in blue, accepted cards in yellow.
function drawDebug(d) {
  const c = $('dbgView');
  c.width = d.W; c.height = d.H;
  const ctx = c.getContext('2d'), img = ctx.createImageData(d.W, d.H);
  for (let i = 0; i < d.edge.length; i++) {
    const v = d.edge[i] ? 200 : 20;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#4da3ff'; d.blobs.forEach((b) => ctx.strokeRect(b.x0 + 0.5, b.y0 + 0.5, b.w, b.h));
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffd166'; d.kept.forEach((b) => ctx.strokeRect(b.x0, b.y0, b.w, b.h));
  ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif';
  ctx.fillText(`${S.video.videoWidth}×${S.video.videoHeight} ${S.kind}${S.cropped ? ' cropped' : ''} · ${d.kept.length} cards`, 4, 12);
}
$('dbg').addEventListener('change', () => { $('dbgView').hidden = !$('dbg').checked; });

function chooseFocus() {
  const ids = new Set(S.tracks.map((t) => t.id));
  if (S.pinnedId && !ids.has(S.pinnedId)) S.pinnedId = null;
  const prev = S.focusId;
  if (S.pinnedId) S.focusId = S.pinnedId;
  else {
    // Follow the biggest card: a card held up to the camera or zoomed by the streamer.
    const best = S.tracks.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
    const cur = S.tracks.find((t) => t.id === prev);
    // Stick with the current card unless another is clearly bigger, to avoid jumping around.
    S.focusId = !best ? null : cur && cur.w * cur.h > best.w * best.h * 0.8 ? cur.id : best.id;
  }
  if (S.focusId !== prev && S.focusId && !S.manual) pushHistorySoon();
}

function renderMarks() {
  marks.replaceChildren();
  // Marks drawn over the stage would be captured into the frames we analyse, so only draw
  // them when reading a <video> directly. During tab capture the "On screen" strip is the UI.
  if (S.kind !== 'direct') return;
  for (const t of S.tracks) {
    const b = toStage(t);
    const m = document.createElement('div');
    m.className = 'mark' + (t.id === S.focusId ? ' focus' : '');
    Object.assign(m.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
    m.title = 'Show this card';
    m.onclick = () => pin(t.id);
    marks.appendChild(m);
  }
}

const thumbs = new Map();
function renderSpotted() {
  const box = $('spotted');
  $('spottedEmpty').hidden = S.tracks.length > 0;
  for (const [id, c] of thumbs) if (!S.tracks.some((t) => t.id === id)) { c.remove(); thumbs.delete(id); }
  for (const t of S.tracks) {
    let c = thumbs.get(t.id);
    if (!c) {
      c = document.createElement('canvas');
      c.title = 'Show this card';
      c.onclick = () => pin(t.id);
      thumbs.set(t.id, c); box.appendChild(c);
    }
    c.classList.toggle('focus', t.id === S.focusId);
    c.classList.toggle('pinned', t.id === S.pinnedId);
    const id = S.ids.get(t.id);
    c.title = id && id.card ? id.card.name : 'Show this card';
    try {
      Z.renderCrop(S.video, Z.clampRect(t.x, t.y, t.w, t.h, S.video.videoWidth, S.video.videoHeight), c,
        { maxW: 120, maxH: 168, minScale: 0.1, sharpen: false, rotate: t.rotated && $('rotate').checked });
    } catch { /* unreadable source */ }
  }
}

function pin(id) {
  S.manual = null;
  S.pinnedId = S.pinnedId === id ? null : id;
  S.focusId = id;
  renderMarks(); renderSpotted(); renderZoom(true);
  updateButtons();
  if ($('autoId').checked && !identifying && !S.ids.has(id) && !S.identified.has(id)) { S.identified.add(id); identify(true); }
}

function setAuto(on) {
  S.auto = on;
  $('auto').classList.toggle('on', on);
  if (!on) resetSpotting();
}
$('auto').onclick = () => setAuto(!S.auto);

// Auto identify: once a focused card has been steady for a few frames, OCR its name and look it up.
let identifying = false;
async function maybeIdentify() {
  if (!$('autoId').checked || identifying || S.manual) return;
  const t = S.tracks.find((t) => t.id === S.focusId);
  if (!t || t.hits < 4 || S.identified.has(t.id) || zoom.hidden) return;
  S.identified.add(t.id);
  await identify(true);
}

// ---------- Manual picking (fallback) ----------
let selecting = false;
function setSelectMode(on) {
  selecting = on && !!S.video;
  overlay.classList.toggle('active', selecting);
  $('selectMode').classList.toggle('on', selecting);
}
$('selectMode').onclick = () => setSelectMode(!selecting);

let drag = null;
overlay.addEventListener('pointerdown', (e) => {
  const r = stage.getBoundingClientRect();
  drag = { x0: e.clientX - r.left, y0: e.clientY - r.top, r };
  overlay.setPointerCapture(e.pointerId);
  showBox(drag.x0, drag.y0, 0, 0);
});
overlay.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const x = e.clientX - drag.r.left, y = e.clientY - drag.r.top;
  showBox(Math.min(x, drag.x0), Math.min(y, drag.y0), Math.abs(x - drag.x0), Math.abs(y - drag.y0));
});
overlay.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const { r } = drag;
  const x = e.clientX - r.left, y = e.clientY - r.top;
  let b = { x: Math.min(x, drag.x0), y: Math.min(y, drag.y0), w: Math.abs(x - drag.x0), h: Math.abs(y - drag.y0) };
  drag = null;
  if (b.w < 8 || b.h < 8) b = Z.clickToSelection(x, y, r.width, r.height);
  b.x = Math.max(0, b.x); b.y = Math.max(0, b.y);
  b.w = Math.min(b.w, r.width - b.x); b.h = Math.min(b.h, r.height - b.y);
  S.manual = { x: b.x / r.width, y: b.y / r.height, w: b.w / r.width, h: b.h / r.height };
  S.pinnedId = null;
  // Hide the box before grabbing so it is not baked into the captured frame.
  selbox.style.display = 'none';
  setSelectMode(false);
  requestAnimationFrame(() => requestAnimationFrame(() => { renderZoom(true); renderSpotted(); updateButtons(); }));
});
function showBox(x, y, w, h) {
  Object.assign(selbox.style, { display: 'block', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
}

// ---------- Zoom panel ----------
function renderZoom(addToHistory) {
  const rect = currentRect();
  if (!rect) {
    if (!S.manual && !S.tracks.length) { zoom.hidden = true; $('zoomEmpty').hidden = false; $('full').disabled = $('readName').disabled = true; }
    return;
  }
  const box = $('zoomBox').getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const t = S.manual ? null : S.tracks.find((t) => t.id === S.focusId);
  const rotate = $('rotate').checked !== !!(t && t.rotated); // auto-rotate tapped cards upright
  try {
    Z.renderCrop(S.video, rect, zoom, {
      maxW: box.width * dpr, maxH: box.height * dpr, rotate,
      sharpen: $('sharpen').checked, contrast: $('contrast').checked,
    });
  } catch { return status('The browser blocked reading this video. Use Start capture instead.'); }
  zoom.hidden = false; $('zoomEmpty').hidden = true;
  $('full').disabled = false; $('readName').disabled = false;
  updateZoomView();
  if (addToHistory) pushHistory();
  if (lbLive) drawLightboxZoom();
}
// ---------- Official scan vs stream crop ----------
const official = $('official');
function currentKey() { return S.manual ? 'manual' : S.focusId; }
function currentId() { const k = currentKey(); return k == null ? null : S.ids.get(k); }
function updateZoomView() {
  const id = currentId(), card = id && id.card;
  // A weak look match is likely a misread name: keep the stream view unless the viewer asks.
  const unsure = !!card && !id.picked && typeof card.match === 'number' && card.match < 0.5;
  const showOfficial = !!card && S.view === 'official' && !zoom.hidden && (!unsure || id.forced);
  if (card && official.dataset.src !== (card.big || card.img)) {
    official.dataset.src = card.big || card.img;
    official.src = card.big || card.img;
    official.alt = card.name;
  }
  official.hidden = !showOfficial;
  zoom.style.display = showOfficial ? 'none' : '';
  $('viewOfficial').disabled = !card;
  $('viewOfficial').classList.toggle('on', showOfficial);
  $('viewStream').classList.toggle('on', !showOfficial);
  const cap = $('zoomCap');
  cap.replaceChildren();
  if (card) {
    const pct = typeof card.match === 'number' ? ` · ${Math.round(Math.max(0, card.match) * 100)}% look match` : '';
    cap.append(`${unsure ? 'Best guess: ' : ''}${card.name} · ${L.GAMES[card.game].label}${card.set ? ' · ' + card.set : ''}${pct} `);
    if (card.link) { const a = document.createElement('a'); a.href = card.link; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Details'; cap.append(a); }
  } else if (identifying && !zoom.hidden) cap.textContent = 'Identifying…';
}
$('viewOfficial').onclick = (e) => {
  e.stopPropagation(); S.view = 'official';
  const id = currentId(); if (id) id.forced = true;
  updateZoomView();
};
$('viewStream').onclick = (e) => { e.stopPropagation(); S.view = 'stream'; updateZoomView(); };

['sharpen', 'contrast', 'rotate'].forEach((id) => $(id).addEventListener('change', () => { renderZoom(false); renderSpotted(); }));

let histTimer = 0;
function pushHistorySoon() { clearTimeout(histTimer); histTimer = setTimeout(() => pushHistory(), 50); }
function pushHistory() {
  if (zoom.hidden) return;
  let url;
  try { url = zoom.toDataURL('image/jpeg', 0.85); } catch { return; }
  S.history.unshift(url);
  S.history = S.history.slice(0, 12);
  const h = $('history');
  h.replaceChildren(...S.history.map((u) => {
    const im = new Image(); im.src = u; im.title = 'Open full size';
    im.onclick = () => openLightboxImage(u, 'Saved crop');
    return im;
  }));
  $('historySec').hidden = false;
}

// ---------- Live mode (re-render the zoom every frame, not just on each detection) ----------
let raf = 0, lastT = 0;
function liveLoop(t) {
  if (!S.live) return;
  if (t - lastT > 66) { renderZoom(false); lastT = t; }
  raf = requestAnimationFrame(liveLoop);
}
function startLive() { if (!currentRect()) return; S.live = true; $('live').classList.add('on'); raf = requestAnimationFrame(liveLoop); }
function stopLive() { S.live = false; cancelAnimationFrame(raf); $('live').classList.remove('on'); }
$('live').onclick = () => (S.live ? stopLive() : startLive());

// ---------- Lightbox ----------
let lbLive = false;
const lbCanvas = document.createElement('canvas');
function openLightboxImage(src, cap) {
  lbLive = false;
  const im = new Image(); im.src = src; im.alt = cap || '';
  $('lbContent').replaceChildren(im);
  $('lbCap').textContent = cap || '';
  $('lightbox').classList.add('open');
}
function drawLightboxZoom() {
  lbCanvas.width = zoom.width; lbCanvas.height = zoom.height;
  lbCanvas.getContext('2d').drawImage(zoom, 0, 0);
}
function openLightboxZoom() {
  if (zoom.hidden) return;
  if (!official.hidden) { const c = currentId().card; return openLightboxImage(c.big || c.img, c.set ? `${c.name} (${c.set})` : c.name); }
  lbLive = true; drawLightboxZoom();
  $('lbContent').replaceChildren(lbCanvas);
  $('lbCap').textContent = 'Click or press Esc to close.';
  $('lightbox').classList.add('open');
}
function closeLightbox() { $('lightbox').classList.remove('open'); lbLive = false; }
$('lightbox').onclick = closeLightbox;
$('zoomBox').onclick = openLightboxZoom;
$('full').onclick = openLightboxZoom;

// ---------- Keyboard ----------
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { closeLightbox(); setSelectMode(false); }
  else if (k === 'z' && S.video) setSelectMode(!selecting);
  else if (k === 'a') setAuto(!S.auto);
  else if (k === 'l' && !$('live').disabled) $('live').click();
  else if (k === 'f') ($('lightbox').classList.contains('open') ? closeLightbox() : openLightboxZoom());
});
window.addEventListener('resize', () => { if (!S.live) { renderZoom(false); renderMarks(); } });

// ---------- Lookup ----------
async function runLookup(q) {
  q = q.trim();
  if (!q) return;
  const game = $('game').value;
  const keys = game === 'all' ? Object.keys(L.GAMES) : [game];
  $('lookupMsg').textContent = `Searching ${keys.map((k) => L.GAMES[k].label).join(', ')}…`;
  $('results').replaceChildren();
  const { results, failed } = await L.searchCards(q, keys);
  renderResults(results);
  const msg = $('lookupMsg');
  msg.textContent = (results.length ? `${results.length} result${results.length > 1 ? 's' : ''} for "${q}". ` : `No matches for "${q}". `) +
    (failed.length ? `Couldn't reach ${failed.map((k) => L.GAMES[k].label).join(', ')}. ` : '');
  const a = document.createElement('a');
  a.href = L.otherGamesUrl(q); a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Search TCGplayer';
  msg.append(a, ' for other games.');
  return results;
}
// Clicking a result makes it the zoomed card's official image (to correct a wrong match).
function renderResults(results) {
  $('results').replaceChildren(...results.map((c) => {
    const el = document.createElement('div'); el.className = 'card';
    el.innerHTML = '<img loading="lazy" alt=""><span class="badge"></span><div class="name"></div>';
    el.querySelector('img').src = c.img;
    el.querySelector('img').alt = c.name;
    el.querySelector('.badge').textContent = L.GAMES[c.game].label;
    el.querySelector('.name').textContent = c.set ? `${c.name} · ${c.set}` : c.name;
    el.title = 'Use this image for the zoomed card';
    el.onclick = () => {
      const k = currentKey();
      if (k == null || zoom.hidden) return openLightboxImage(c.big || c.img, c.set ? `${c.name} (${c.set})` : c.name);
      S.ids.set(k, { ...(S.ids.get(k) || {}), card: c, picked: true });
      S.view = 'official'; updateZoomView(); renderSpotted();
    };
    return el;
  }));
}
$('lookupForm').onsubmit = (e) => { e.preventDefault(); runLookup($('q').value); };

async function identify(auto) {
  if (zoom.hidden) return;
  const key = currentKey();
  // Work on a copy: the live zoom keeps changing while OCR and lookups run.
  const crop = document.createElement('canvas');
  crop.width = zoom.width; crop.height = zoom.height;
  crop.getContext('2d').drawImage(zoom, 0, 0);
  const btn = $('readName'); btn.disabled = true; btn.textContent = 'Reading…';
  identifying = true; updateZoomView();
  try {
    const name = await O.readCardName(crop);
    if (!name) { if (!auto) $('lookupMsg').textContent = "Couldn't read a name. Try a tighter box around the card, or type it."; return; }
    $('q').value = name;
    const results = await runLookup(name);
    if (!results.length) return;
    const ranked = await M.rankByLook(crop, results);
    renderResults(ranked);
    if (key != null) S.ids.set(key, { card: ranked[0], ranked });
  } catch (e) {
    $('lookupMsg').textContent = e.message || 'Reading failed.';
  } finally {
    identifying = false;
    btn.disabled = false; btn.textContent = 'Read name';
    updateZoomView(); renderSpotted();
  }
}
$('readName').onclick = () => identify(false);

// ---------- Demo table for trying it without a stream (?demo) ----------
if (new URLSearchParams(location.search).has('demo')) {
  const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
  const g = c.getContext('2d');
  const cards = [['Lightning Bolt', '#b03a2e', 260, 250, 0], ['Pikachu', '#d4ac0d', 520, 250, 0], ['Dark Magician', '#7d3c98', 800, 300, 1]];
  let f = 0;
  (function draw() {
    g.fillStyle = '#1d5c3a'; g.fillRect(0, 0, 1280, 720);
    cards.forEach(([n, col, x0, y0, tapped], i) => {
      const y = y0 + Math.sin((f + i * 20) / 30) * 6;
      g.save(); g.translate(x0, y);
      if (tapped) { g.translate(214, 0); g.rotate(Math.PI / 2); }
      g.fillStyle = '#111'; g.fillRect(-4, -4, 160, 222);
      g.fillStyle = col; g.fillRect(0, 0, 152, 214);
      g.fillStyle = '#f5f0e6'; g.fillRect(8, 8, 136, 22);
      g.fillStyle = '#111'; g.font = 'bold 14px serif'; g.fillText(n, 12, 24);
      g.fillStyle = '#ddd'; g.fillRect(8, 36, 136, 90);
      g.fillStyle = '#f5f0e6'; g.fillRect(8, 134, 136, 70);
      g.restore();
    });
    f++; requestAnimationFrame(draw);
  })();
  clearStage();
  const v = document.createElement('video');
  v.muted = true; v.autoplay = true; v.playsInline = true;
  v.srcObject = c.captureStream(30);
  useVideoElement(v);
  v.play();
  status('Demo table loaded. Watching for cards.');
}
})();
