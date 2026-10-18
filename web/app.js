// Card Zoom web page: wires the page to the reusable core (core/*.js).
// The page plays a stream, finds the cards on screen, recognises them by picture and draws each
// card's official scan where it lies; hovering a card shows it at a readable size.
// Everything specific to this page lives here; an extension or app would replace this file and
// keep core/ as is.
(function () {
'use strict';
const { zoom: Z, detect: D, match: M, fingerprint: F, cardnet: CN } = window.CardZoom;
const $ = (id) => document.getElementById(id);
const stage = $('stage'), media = $('media'), marks = $('marks'), pop = $('pop');
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug'); // draw every detection, recognised or not

const S = {
  embed: null,        // iframe for a YouTube/Twitch embed
  video: null,        // <video> whose frames we can read (direct video, or the capture stream)
  kind: null,         // 'direct' | 'capture'
  cropped: false,     // capture track cropped to the video area (Region or Element Capture)
  restricted: false,  // Element Capture: our own overlays are left out of the captured frames
  overlay: true,      // draw recognised cards over the video (O toggles)
  excluded: [],       // areas the viewer marked "Not a card", as stage fractions {x,y,w,h}
  tick: 0,
  tracks: [],         // cards currently spotted (source pixel boxes with stable ids)
  tries: new Map(),   // track id -> picture-match attempts so far
  ids: new Map(),     // track id -> {card, flip, sig}: what the card was recognised as
  near: new Map(),    // track id -> closest match so far, recognised or not (shown with ?debug)
  hover: null,        // track id under the mouse
};
const tracker = D.createTracker();

// A message from an action stays until the next one; while the page is just watching, the line
// instead shows what it is doing, so a viewer can see where it gets stuck.
let statusIsLive = false;
function status(msg, live = false) { $('status').textContent = msg; statusIsLive = live; }

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
  tracker.reset(); S.tracks = []; S.ids.clear(); S.tries.clear(); S.near.clear(); progress.clear(); embedTries.clear(); seenFormats.clear(); namedOnStream.clear(); if (pictureIndexes.mtg) pictureIndexes.mtg.narrow = pictureIndexes.mtg.format = null; S.excluded = []; S.hover = null;
  renderMarks();
}

function clearStage() {
  if (S.embed) S.embed.remove();
  S.embed = null;
  if (S.kind === 'direct') { S.video.remove(); S.video = null; S.kind = null; }
  $('empty').hidden = true;
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
  media.appendChild(f);
  S.embed = f;
  if (location.protocol === 'file:') status('Embeds need the page served from a web server (see README). "Open video file" works without one.');
  else status(S.kind === 'capture' ? 'Capturing. Watching for cards.' : 'Press "Start capture" and choose this tab so the page can see the video.');
  updateButtons();
}

function useVideoElement(v) {
  media.appendChild(v);
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
    status('Watching for cards.', true);
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
  if (!navigator.mediaDevices?.getDisplayMedia) return status('This browser cannot capture a tab. Try desktop Chrome or Edge.');
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser', frameRate: 30, width: { ideal: 3840 }, height: { ideal: 2160 } },
      audio: false, preferCurrentTab: true, selfBrowserSurface: 'include',
    });
  } catch { return status('Capture was cancelled.'); }
  const track = stream.getVideoTracks()[0];
  S.cropped = S.restricted = false;
  const self = track.getSettings().displaySurface === 'browser';
  // Element Capture (Chrome 132+): capture only the video element, so the cards drawn on top of
  // it never end up in the frames we analyse. Region Capture (older Chrome/Edge) crops the same
  // area but includes anything on top, so cards can't be drawn there.
  if (self && window.RestrictionTarget && track.restrictTo) {
    try { await track.restrictTo(await RestrictionTarget.fromElement(media)); S.cropped = S.restricted = true; } catch { /* a different tab was picked */ }
  }
  if (self && !S.cropped && window.CropTarget && track.cropTo) {
    try { await track.cropTo(await CropTarget.fromElement(media)); S.cropped = true; } catch { /* a different tab was picked */ }
  }
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.srcObject = stream;
  await v.play().catch(() => {});
  S.video = v; S.kind = 'capture';
  resetSpotting();
  track.addEventListener('ended', () => stopCapture());
  if (S.restricted) status('Watching for cards.', true);
  else status(S.cropped
    ? 'Cards can only be drawn over the video in Chrome 132 or newer. Update Chrome to see them.'
    : 'Capturing. If you picked another tab or window, cards will land in the wrong place: pick "this tab".');
  updateButtons();
}
function stopCapture(quiet) {
  if (S.kind !== 'capture') return;
  S.video.srcObject?.getTracks().forEach((t) => t.stop());
  S.video = null; S.kind = null; resetSpotting();
  if (!quiet) status('Capture stopped.');
  updateButtons();
}
$('capture').onclick = () => (S.kind === 'capture' ? stopCapture() : startCapture());

function updateButtons() {
  $('capture').textContent = S.kind === 'capture' ? 'Stop capture' : 'Start capture';
  $('capture').classList.toggle('on', S.kind === 'capture');
  // With an embed, nothing can be seen until the viewer shares the tab: make that the obvious next step.
  $('capture').classList.toggle('nudge', !!S.embed && S.kind !== 'capture');
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
function stageRegion() { return Z.mapSelection({ ...frameInfo(), sel: { x: 0, y: 0, w: 1, h: 1 } }); }
// Source pixel box -> CSS px relative to the stage.
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

// ---------- Spotting cards ----------
// The trained detector (models/cards-obb.onnx) is used once it has loaded; until then, or if it
// can't load (offline, old browser, ?classic), the edge-based detector in core/detect.js.
const DETECT_MS = 350;
let netBusy = false, netState = null; // null, 'loading', 'ready', 'failed'
function loadCardNet() {
  if (!CN || netState || params.has('classic')) return;
  netState = 'loading';
  CN.load('models/cards-obb.onnx').then(() => {
    netState = 'ready';
    // The learned matcher shares the detector's runtime; it is used for games whose card list
    // has embeddings (built when models/card-embed.onnx exists).
    if (!params.has('hashonly')) CN.loadEmbed('models/card-embed.onnx').catch((e) => console.warn('Card matcher failed to load:', e));
  }).catch((e) => {
    console.warn('Card finder failed to load:', e);
    netState = 'failed';
  });
}
// What the page is doing right now, in one line.
function liveStatus(dets) {
  if (!statusIsLive) return;
  const parts = [];
  if (netState === 'loading') parts.push('Loading the card finder…');
  if (netState === 'failed') parts.push('The card finder could not load, so a simpler one is used.');
  const want = PICTURE_GAMES.length, have = Object.keys(pictureIndexes).length;
  const failed = PICTURE_GAMES.filter((g) => indexState[g] === 'failed');
  if (have < want) parts.push(`Card lists loaded: ${have} of ${want}${failed.length ? ` (failed: ${failed.join(', ')})` : ''}.`);
  const named = S.tracks.filter((t) => S.ids.has(t.id)).length;
  parts.push(dets.length ? `${dets.length} cards spotted, ${named} recognised.` : blankFrame() ? 'The captured video looks blank.' : 'No cards spotted yet.');
  if (DEBUG) {
    const tried = S.tracks.filter((t) => S.tries.get(t.id)).length, v = S.video;
    parts.push(`[tried ${tried}, frame ${v.videoWidth}x${v.videoHeight}, games ${Object.keys(pictureIndexes).join('/')}${pictureIndexes.mtg?.format ? ', format ' + pictureIndexes.mtg.format : ''}, finder ${netState || 'off'}]`);
  }
  status(parts.join(' '), true);
}
// A capture that only delivers black frames looks like "no cards"; say so instead.
const probe = document.createElement('canvas');
function blankFrame() {
  try {
    probe.width = 32; probe.height = 18;
    const c = probe.getContext('2d', { willReadFrequently: true });
    c.drawImage(S.video, 0, 0, 32, 18);
    const d = c.getImageData(0, 0, 32, 18).data;
    let max = 0;
    for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i], d[i + 1], d[i + 2]);
    return max < 12;
  } catch { return false; }
}
setInterval(() => {
  if (!S.video || !S.video.videoWidth || document.hidden) return;
  loadPictureIndexes(); loadCardNet();
  const region = stageRegion();
  if (!region) return;
  if (CN && CN.ready()) {
    if (netBusy) return; // skip ticks while one frame is still running
    netBusy = true;
    CN.detect(S.video, region).then((dets) => afterDetect(dets, region))
      .catch(() => status('The browser blocked reading this video. Use Start capture instead.'))
      .finally(() => { netBusy = false; });
    return;
  }
  let dets;
  try { dets = D.detectCards(S.video, region); } catch { return status('The browser blocked reading this video. Use Start capture instead.'); }
  afterDetect(dets, region);
}, DETECT_MS);

function afterDetect(dets, region) {
  if (!S.video) return;
  S.tracks = tracker.update(dets.filter((d) => !isExcluded(d, region)));
  for (const id of S.ids.keys()) if (!S.tracks.some((t) => t.id === id)) S.ids.delete(id);
  for (const id of progress.keys()) if (!S.tracks.some((t) => t.id === id)) progress.delete(id);
  if (++S.tick % 6 === 0) recheckIdentities();
  renderMarks();
  if (S.tick % 3 === 0) liveStatus(dets);
}

// ---------- "Not a card" ----------
function toFrac(b, region) { return { x: (b.x - region.x) / region.w, y: (b.y - region.y) / region.h, w: b.w / region.w, h: b.h / region.h }; }
function isExcluded(d, region) {
  const f = toFrac(d, region), cx = f.x + f.w / 2, cy = f.y + f.h / 2;
  return S.excluded.some((e) => cx > e.x && cx < e.x + e.w && cy > e.y && cy < e.y + e.h);
}
function rejectTrack(id) {
  const t = S.tracks.find((t) => t.id === id), region = stageRegion();
  if (!t || !region) return;
  // Ignore a generous area around it: a person in a webcam box moves around inside it.
  const f = toFrac(t, region), pad = 0.5;
  S.excluded.push({ x: f.x - f.w * pad, y: f.y - f.h * pad, w: f.w * (1 + 2 * pad), h: f.h * (1 + 2 * pad) });
  tracker.remove(id); S.tracks = S.tracks.filter((t) => t.id !== id); S.ids.delete(id);
  hidePop(); renderMarks();
  status('Got it. That area is ignored until you load another video.');
}

// A card swapped for another in the same spot keeps its box: every couple of seconds, compare
// each recognised card with how it looked when recognised, and recognise it again if it changed.
function recheckIdentities() {
  for (const t of S.tracks) {
    const id = S.ids.get(t.id);
    if (!id || !id.sig) continue;
    try {
      if (M.similarity(M.signature(S.video, t.x, t.y, t.w, t.h), id.sig) < 0.6) { S.ids.delete(t.id); S.tries.delete(t.id); }
    } catch { /* unreadable */ }
  }
}

// ---------- Picture recognition ----------
// One index per game, built by .github/workflows/build-index.yml from each game's card database
// and served with the page. A game whose index is missing is simply not recognised.
const PICTURE_GAMES = ['mtg', 'pokemon', 'lorcana', 'yugioh', 'swu', 'fab'];
const pictureIndexes = {}, gameHits = {};
const indexState = {}; // game -> 'loading' | 'failed', removed once loaded
function loadPictureIndexes() {
  if (!F) return;
  for (const g of PICTURE_GAMES) {
    if (pictureIndexes[g] || indexState[g] === 'loading') continue;
    if (indexState[g] === 'failed' && S.tick % 60) continue; // retry a failed list now and then
    indexState[g] = 'loading';
    F.loadIndex('data/' + g).then(async (ix) => {
      if (ix.info.embedding) {
        try {
          const r = await fetch('data/' + g + '.emb');
          if (r.ok) ix.emb = new Int8Array(await r.arrayBuffer());
        } catch { /* fall back to picture hashes */ }
      }
      pictureIndexes[g] = ix; gameHits[g] = 0; delete indexState[g];
    })
      .catch((e) => { console.warn('Card list for', g, 'failed to load:', e); indexState[g] = 'failed'; });
  }
}
// Games to try for a card: the one this stream has been matching, alone, once it is clear;
// otherwise every game, most-matched first.
function gamesToTry() {
  const gs = Object.keys(pictureIndexes).sort((a, b) => gameHits[b] - gameHits[a]);
  if (gs.length > 1 && gameHits[gs[0]] >= 2 && gameHits[gs[1]] === 0) return gs.slice(0, 1);
  return gs;
}
// Every steady card is tried; one that doesn't match (a non-card, or a bad frame) is retried a
// few times on later frames. Matching one card against one game's list takes about a tenth of a
// second, so each tick spends a fixed budget, one game at a time, and a card's games may be
// spread over several ticks: the hovered card first, then the cards tried least so far, biggest
// first (a big card is the likeliest to match, and its match settles which game this is).
const progress = new Map(); // track id -> games already tried in its current try
const lastTry = new Map();  // track id -> when its last try finished
// Recognition runs on its own clock, not once per detection: on a slow computer the detector can
// take a second or more per frame, and recognition waiting on it took minutes to name anything.
setInterval(() => {
  if (!S.video || document.hidden) return;
  const before = S.ids.size;
  recognise();
  if (S.ids.size !== before) renderMarks();
}, 200);
function recognise() {
  if (!Object.keys(pictureIndexes).length) return;
  const until = performance.now() + 150;
  const due = S.tracks.filter((t) => {
    if (t.hits < 3 || S.ids.has(t.id)) return false;
    const tries = S.tries.get(t.id) || 0;
    return tries < 8 && (!tries || progress.has(t.id) || performance.now() - (lastTry.get(t.id) || 0) > 1000);
  }).sort((a, b) => (b.id === S.hover) - (a.id === S.hover) || (S.tries.get(a.id) || 0) - (S.tries.get(b.id) || 0)
    || b.w * b.h - a.w * a.h);
  for (const t of due) {
    const done = progress.get(t.id) || new Set();
    for (const game of gamesToTry()) {
      if (done.has(game)) continue;
      if (performance.now() > until) { progress.set(t.id, done); return; }
      done.add(game);
      if (identifyByPicture(t, game)) break;
    }
    progress.delete(t.id);
    S.tries.set(t.id, (S.tries.get(t.id) || 0) + 1);
    lastTry.set(t.id, performance.now());
  }
}
// Accept a match only when it is close and clearly better than the next-best card.
// The build's self-test picks the colour weight and distance cut-off and stores them in the index.
// On real broadcasts (sleeves, glare, tilted and upside-down cards) a wrong card can come close,
// but almost never with a clear lead, so a loose match also needs a wide margin. Both are
// relative to the index's cut-off, since that scales with the colour weight the build picks.
const STRONG_LEAD = 0.42, CLOSE_MATCH = 0.5;
// Magic has 50,000+ artworks but a match is played in one format. Once several cards are named,
// the narrowest format they are all legal in is assumed, and every other try searches only cards
// legal there: fewer look-alikes, so blurry cards win by a clearer margin. The remaining tries
// search everything, so a card from outside the guess can still be found and widen it.
const NARROWING = ['standard', 'pioneer', 'modern', 'legacy', 'vintage'];
const seenFormats = new Map(); // card name -> legality bits, for named Magic cards
const namedOnStream = new Set(); // 'game|name' of every card named since the video was loaded
function updateFormat(ix) {
  const names = ix.info.formats;
  // Tokens and helper cards (a substitute for a double-faced card) are legal nowhere and
  // turn up in every format, so they neither vote nor get narrowed away.
  const bits = [...seenFormats.values()].filter((b) => b);
  if (!names || bits.length < 5) return;
  for (const f of NARROWING) {
    const bit = 1 << names.indexOf(f);
    if (names.indexOf(f) < 0 || !bits.every((b) => b & bit)) continue;
    if (ix.format === f) return;
    ix.format = f;
    ix.narrow = Uint8Array.from(ix.meta, (row) => (!row[4] || row[4] & bit ? 1 : 0));
    return;
  }
}
function identifyByPicture(t, game) {
  // The trained detector gives the card's angle and size; the edge detector only an upright box.
  const o = t.obb, cx = o ? o.cx : t.x + t.w / 2, cy = o ? o.cy : t.y + t.h / 2;
  const cw = o ? o.cw : t.rotated ? t.h : t.w, ch = o ? o.ch : t.rotated ? t.w : t.h;
  const base = o ? o.angle : t.rotated ? 90 : 0;
  {
    const ix = pictureIndexes[game], info = ix.info, maxDist = info.maxDist ?? 24, minMargin = info.minMargin ?? 1;
    let best;
    ix.allow = ix.narrow && (S.tries.get(t.id) || 0) % 2 === 0 ? ix.narrow : null;
    try {
      best = F.matchVariants(ix, (flip, angle, scale, dx, dy) =>
        F.describeBox(S.video, cx + dx * cw, cy + dy * ch, cw * scale, ch * scale, base + flip + angle),
      info.weight ?? F.COLOR_WEIGHT, o ? F.FINE_OBB : undefined);
    } catch { return false; } finally { ix.allow = null; }
    const near = S.near.get(t.id);
    if (!near || best.d / maxDist < near.d / near.maxDist) S.near.set(t.id, { game, name: ix.meta[best.i][0], d: best.d, margin: best.margin, maxDist });
    if (best.d > maxDist || best.margin < minMargin) return false;
    // Decks repeat cards (four copies, basic lands): a loose match to a card already named on
    // this stream doesn't need the wide lead a first sighting does.
    const seenBefore = namedOnStream.has(game + '|' + ix.meta[best.i][0]);
    if (!seenBefore && best.margin < STRONG_LEAD * maxDist && best.d > CLOSE_MATCH * maxDist) return false;
    namedOnStream.add(game + '|' + ix.meta[best.i][0]);
    // A close match with a wide lead settles the game on its own; a looser one needs a second.
    gameHits[game] += best.d <= CLOSE_MATCH * maxDist && best.margin >= STRONG_LEAD * maxDist ? 2 : 1;
    if (game === 'mtg' && ix.meta[best.i][4] != null) { seenFormats.set(ix.meta[best.i][0], ix.meta[best.i][4]); updateFormat(ix); }
    S.ids.set(t.id, { card: pictureCard(game, ix.meta[best.i]), flip: best.variant.flip, sig: M.signature(S.video, t.x, t.y, t.w, t.h) });
    return true;
  }
  return false;
}
// ---------- Learned matcher ----------
// A trained network (tools/matcher/train_embed.py) turns each card crop into 128 numbers that
// stay close for the same card through blur, glare, sleeves and tiny sizes. It runs alongside
// the picture hashes, one card at a time in the background worker: the crop upright and turned
// round, at two sizes, compared with every card of each game that has embeddings.
let embedBusy = false;
const embedTries = new Map();
function embedGames() { return gamesToTry().filter((g) => pictureIndexes[g].emb); }
function embedSearch(ix, q, off) {
  const D = ix.info.embedding.dim, emb = ix.emb, n = ix.meta.length, k = ix.info.embedding.scale, allow = ix.allow;
  let b1 = -1, s1 = -9, b2 = -1, s2 = -9;
  for (let r = 0; r < n; r++) {
    if (allow && !allow[r]) continue;
    let dot = 0; const o = r * D;
    for (let j = 0; j < D; j++) dot += q[off + j] * emb[o + j];
    if (dot > s1) { if (b1 >= 0 && ix.meta[b1][0] !== ix.meta[r][0]) { b2 = b1; s2 = s1; } b1 = r; s1 = dot; }
    else if (dot > s2 && ix.meta[r][0] !== ix.meta[b1][0]) { b2 = r; s2 = dot; }
  }
  return { i: b1, s: s1 / k, gap: (s1 - s2) / k };
}
setInterval(async () => {
  if (embedBusy || !S.video || document.hidden || !CN || !CN.embedReady()) return;
  const games = embedGames();
  if (!games.length) return;
  const t = S.tracks.filter((t) => t.hits >= 3 && t.obb && !S.ids.has(t.id) && (embedTries.get(t.id) || 0) < 4)
    .sort((a, b) => (b.id === S.hover) - (a.id === S.hover) || (embedTries.get(a.id) || 0) - (embedTries.get(b.id) || 0) || b.w * b.h - a.w * a.h)[0];
  if (!t) return;
  embedBusy = true;
  embedTries.set(t.id, (embedTries.get(t.id) || 0) + 1);
  try {
    const o = t.obb, boxes = [];
    for (const flip of [0, 180]) for (const sc of [0.96, 1.04]) boxes.push({ cx: o.cx, cy: o.cy, cw: o.cw * sc, ch: o.ch * sc, angle: o.angle + flip });
    const q = await CN.embed(S.video, boxes), D = 128;
    if (S.ids.has(t.id) || !S.tracks.some((x) => x.id === t.id)) return;
    for (const game of games) {
      const ix = pictureIndexes[game], E = ix.info.embedding;
      ix.allow = ix.narrow && (embedTries.get(t.id) % 2 === 1) ? ix.narrow : null;
      let best = null, flip = 0;
      boxes.forEach((b, k) => {
        const r = embedSearch(ix, q, k * D);
        if (!best || r.s > best.s) { best = r; flip = k < 2 ? 0 : 180; }
      });
      ix.allow = null;
      const near = S.near.get(t.id);
      if (!near || near.emb === undefined || best.s > near.emb) S.near.set(t.id, { ...(near || { d: 99, margin: 0, maxDist: 1 }), name: ix.meta[best.i][0], emb: best.s, game });
      const seen = namedOnStream.has(game + '|' + ix.meta[best.i][0]);
      if (best.s < E.minSim || best.gap < (seen ? 0 : E.minGap)) continue;
      namedOnStream.add(game + '|' + ix.meta[best.i][0]);
      gameHits[game] += 2;
      if (game === 'mtg' && ix.meta[best.i][4] != null) { seenFormats.set(ix.meta[best.i][0], ix.meta[best.i][4]); updateFormat(ix); }
      S.ids.set(t.id, { card: pictureCard(game, ix.meta[best.i]), flip, sig: M.signature(S.video, t.x, t.y, t.w, t.h) });
      renderMarks();
      break;
    }
  } catch (e) { console.warn('Card matcher:', e); } finally { embedBusy = false; }
}, 100);
function pictureCard(game, row) {
  if (game === 'mtg') {
    // Magic rows hold the Scryfall id; image URLs follow from it.
    const [name, set, num, sid] = row, path = `front/${sid[0]}/${sid[1]}/${sid}`;
    return { name, set: set.toUpperCase(), img: `https://cards.scryfall.io/normal/${path}.jpg`,
      big: `https://cards.scryfall.io/png/${path}.png`, link: `https://scryfall.com/card/${set}/${encodeURIComponent(num)}` };
  }
  const [name, set, num, img, big, link] = row;
  return { name, set: String(set).toUpperCase(), img, big: big || img, link };
}

// ---------- Cards drawn on the video ----------
// Drawing is safe only where it can't leak into the frames we analyse: a direct <video>, or a
// tab capture restricted to the video element.
const marksById = new Map();
function renderMarks() {
  const safe = S.kind === 'direct' || (S.kind === 'capture' && S.restricted);
  const live = new Set();
  if (safe && S.overlay) for (const t of S.tracks) {
    const id = S.ids.get(t.id);
    if (!id && !DEBUG) continue;
    live.add(t.id);
    let m = marksById.get(t.id);
    if (!m) {
      m = document.createElement('div');
      m.className = 'mark';
      m.innerHTML = '<img alt="" draggable="false"><button class="nc" title="Not a card">×</button>';
      m.onmouseenter = () => { S.hover = t.id; showPop(t.id); };
      m.onmouseleave = () => { if (S.hover === t.id) { S.hover = null; hidePop(); } };
      m.onclick = () => { const c = S.ids.get(t.id); if (c && c.card.link) window.open(c.card.link, '_blank', 'noopener'); };
      m.querySelector('.nc').onclick = (e) => { e.stopPropagation(); rejectTrack(t.id); };
      marks.appendChild(m); marksById.set(t.id, m);
    }
    const b = toStage(t);
    m.classList.toggle('debug', !id);
    if (DEBUG && !id) {
      const n = S.near.get(t.id);
      m.dataset.near = n ? `${n.name} ${n.d.toFixed(0)}/${n.maxDist.toFixed(0)} m${n.margin.toFixed(0)}${n.emb !== undefined ? ' e' + n.emb.toFixed(2) : ''} (${S.tries.get(t.id) || 0})` : `not tried (${t.hits} hits)`;
    } else delete m.dataset.near;
    m.title = id ? `${id.card.name}${id.card.set ? ' (' + id.card.set + ')' : ''}` : '';
    m.style.cursor = id && id.card.link ? 'pointer' : 'default';
    Object.assign(m.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
    const img = m.firstChild;
    if (id) {
      const src = id.card.img;
      if (img.dataset.src !== src) { img.dataset.src = src; img.src = src; }
      // Turn the upright scan to lie like the card: by the trained detector's angle when there
      // is one (plus 180 degrees for cards facing the other player), else 90 for tapped cards.
      let sw = t.rotated ? b.h : b.w, sh = t.rotated ? b.w : b.h, turn = t.rotated ? 90 : 0;
      if (t.obb) { const k = b.w / t.w; sw = t.obb.cw * k; sh = t.obb.ch * k; turn = t.obb.angle + (id.flip || 0); }
      Object.assign(img.style, { display: 'block', width: sw + 'px', height: sh + 'px',
        left: (b.w - sw) / 2 + 'px', top: (b.h - sh) / 2 + 'px', transform: turn ? `rotate(${turn}deg)` : '' });
    } else img.style.display = 'none';
  }
  for (const [id, m] of marksById) if (!live.has(id)) { m.remove(); marksById.delete(id); }
  if (S.hover != null && !live.has(S.hover)) { S.hover = null; hidePop(); } else if (S.hover != null) showPop(S.hover);
}

// The hovered card, upright and big enough to read: up to 90% of the stage height, beside the
// card on whichever side has room, kept inside the stage.
function showPop(trackId) {
  const id = S.ids.get(trackId), m = marksById.get(trackId);
  if (!id || !m) return hidePop();
  const src = id.card.big || id.card.img;
  if (pop.dataset.src !== src) { pop.dataset.src = src; pop.src = src; pop.alt = id.card.name; }
  const r = stage.getBoundingClientRect(), b = { x: m.offsetLeft, y: m.offsetTop, w: m.offsetWidth, h: m.offsetHeight };
  const h = Math.min(r.height * 0.9, 700), w = h * 63 / 88, gap = 12;
  let x = b.x + b.w + gap;
  if (x + w > r.width) x = b.x - gap - w;
  if (x < 0) x = Math.max(0, Math.min(r.width - w, b.x + b.w / 2 - w / 2));
  const y = Math.max(0, Math.min(r.height - h, b.y + b.h / 2 - h / 2));
  Object.assign(pop.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  pop.classList.add('open');
}
function hidePop() { pop.classList.remove('open'); }

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  if (e.key.toLowerCase() === 'o') { S.overlay = !S.overlay; renderMarks(); status(S.overlay ? 'Cards shown.' : 'Cards hidden. Press O to show them again.'); }
});
window.addEventListener('resize', renderMarks);

// ---------- Demo table for trying it without a stream (?demo) ----------
if (params.has('demo')) {
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
  status('Demo table loaded. Its drawn cards are not real cards, so add ?debug to see what is spotted.');
}
})();
