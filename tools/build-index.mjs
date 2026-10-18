// Builds a picture index for one game (data/GAME.bin + data/GAME.json) from its public card
// database, then self-tests it on degraded copies of real cards (small, blurred, recompressed,
// re-lit) and reports accuracy. Games: mtg (Scryfall), pokemon (pokemontcg.io data), lorcana (Lorcast),
// yugioh (YGOPRODeck), swu (SWU-DB), fab (the-fab-cube data).
// Runs in GitHub Actions (.github/workflows/build-index.yml). Needs Node 20+ and `sharp`.
// Usage: node tools/build-index.mjs [GAME] [--limit N]
import { createRequire } from 'node:module';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const FP = require('../core/fingerprint.js');
const UA = { 'User-Agent': 'CardZoom/0.1 (github.com/Splickety404/card-zoom)', Accept: 'application/json' };
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const SAMPLE = 800;
const GAME = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'mtg';

async function getJSON(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
const failures = {}; // why images failed, for the log
async function getBuf(url, tries = 4) {
  for (let t = 0; ; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA['User-Agent'] }, signal: AbortSignal.timeout(30000) });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      if (r.status === 404 || r.status === 403) { failures[r.status] = (failures[r.status] || 0) + 1; return null; } // missing (SWU-DB's CDN says 403)
      throw new Error(String(r.status));
    } catch (e) {
      if (t >= tries) { const k = String(e.message).slice(0, 40); failures[k] = (failures[k] || 0) + 1; return null; }
      await new Promise((ok) => setTimeout(ok, 500 * 2 ** t));
    }
  }
}
async function fingerprint(buf) {
  // Landscape cards (Star Wars leaders and bases, Magic battles) are stood up, as the detector
  // reports every card with its long side as height; the page tries both ways up.
  const { width, height } = await sharp(buf).metadata();
  const raw = await sharp(buf).rotate(width > height ? 90 : 0).resize(FP.FW, FP.FH, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  return FP.describe(raw, 3);
}

// ---- 1. Card list: one entry per artwork ----
// Each card: name, set, num, small (image to fingerprint), and for games other than Magic the
// URLs the page shows (Magic's are rebuilt from the Scryfall id to keep the index small).
async function loadBulk(e) {
  // Scryfall offers the file as JSON (download_uri) or gzipped JSON Lines (jsonl_download_uri).
  if (e.download_uri) return getJSON(e.download_uri);
  const r = await fetch(e.jsonl_download_uri, { headers: { 'User-Agent': UA['User-Agent'] } });
  if (!r.ok) throw new Error(`${r.status} ${e.jsonl_download_uri}`);
  let buf = Buffer.from(await r.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf); // fetch may already have decoded it
  return buf.toString('utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}
// Formats a Magic card is legal in, as bits, so the page can search only cards a stream's format allows.
const FORMATS = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'pauper', 'commander'];
const formatBits = (leg = {}) => FORMATS.reduce((b, f, i) => (leg[f] === 'legal' || leg[f] === 'restricted' ? b | (1 << i) : b), 0);
const SOURCES = {
  async mtg() {
    // Every printing whose picture differs: the same artwork in an old border, a showcase or
    // extended-art frame, or borderless lays the card out differently, and a stream shows
    // whichever copy the player owns. (unique_artwork keeps only one frame per artwork.)
    const bulk = await getJSON('https://api.scryfall.com/bulk-data');
    const all = await loadBulk(bulk.data.find((b) => b.type === 'default_cards'));
    const LOOKS = ['showcase', 'extendedart', 'inverted', 'etched', 'shatteredglass', 'borderless'];
    const seen = new Set(), cards = [];
    for (const c of all) {
      if (c.layout === 'art_series' || c.digital || !(c.image_uris || c.card_faces?.[0]?.image_uris)) continue;
      const art = c.illustration_id || c.card_faces?.[0]?.illustration_id || c.id;
      const key = [art, c.frame, c.border_color, c.full_art, c.textless, (c.frame_effects || []).filter((e) => LOOKS.includes(e)).sort().join('+')].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push({ name: c.card_faces?.length && !c.image_uris ? c.card_faces[0].name : c.name,
        set: c.set, num: c.collector_number, id: c.id, small: (c.image_uris || c.card_faces[0].image_uris).small,
        formats: formatBits(c.legalities) });
    }
    return { source: 'Scryfall default_cards, one per artwork and frame', cards };
  },
  async pokemon() {
    // The pokemontcg.io API pages fail under load; its data repository has the same cards as
    // one JSON file per set.
    const base = 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master';
    const sets = await getJSON(`${base}/sets/en.json`), cards = [];
    for (const st of sets) {
      let list;
      try { list = await getJSON(`${base}/cards/en/${st.id}.json`); } catch (e) { console.log('skip set', st.id, e.message); continue; }
      for (const c of list) if (c.images?.small) cards.push({
        name: c.name, set: st.ptcgoCode || st.id, num: c.number, small: c.images.small,
        img: c.images.small, big: c.images.large || c.images.small,
        link: `https://pokemontcg.io/card/${c.id}`,
      });
    }
    return { source: 'pokemontcg.io', cards };
  },
  async lorcana() {
    const sets = await getJSON('https://api.lorcast.com/v0/sets');
    const cards = [];
    for (const st of sets.results || []) {
      const list = await getJSON(`https://api.lorcast.com/v0/sets/${st.id}/cards`);
      for (const c of list) {
        const u = c.image_uris?.digital;
        if (!u) continue;
        cards.push({ name: c.version ? `${c.name} - ${c.version}` : c.name, set: st.code, num: c.collector_number,
          small: u.small, img: u.normal || u.small, big: u.large || u.normal, link: `https://lorcast.com/cards/${st.code}/${c.collector_number}` });
      }
      await new Promise((ok) => setTimeout(ok, 120)); // Lorcast asks for 50-100 ms between requests
    }
    return { source: 'Lorcast', cards };
  },
  async yugioh() {
    const j = await getJSON('https://db.ygoprodeck.com/api/v7/cardinfo.php');
    const cards = [];
    for (const c of j.data) for (const im of c.card_images || []) cards.push({
      name: c.name, set: c.card_sets?.[0]?.set_code?.split('-')[0] || '', num: String(im.id), small: im.image_url_small,
      img: im.image_url, big: im.image_url, link: `https://ygoprodeck.com/card/?search=${encodeURIComponent(c.name)}`,
    });
    return { source: 'YGOPRODeck', cards };
  },
  async swu() {
    // SWU-DB lists cards per set; unknown set codes just return nothing.
    const cards = [], seen = new Set();
    for (const code of ['sor', 'shd', 'twi', 'jtl', 'lof', 'sec', 'law', 'ibh', 'c24', 'c25', 'j24', 'j25', 'p25', 'twis', 'sors', 'shds']) {
      let j;
      try { j = await getJSON(`https://api.swu-db.com/cards/${code}`); } catch (e) { console.log('swu set', code, e.message); continue; }
      const list = j.data || j.cards || [];
      console.log('swu set', code, list.length, 'cards');
      if (list[0] && !cards.length) console.log('swu card fields:', Object.keys(list[0]).join(', '));
      for (const c of list) {
        const art = c.FrontArt || c.frontArt;
        if (!art || seen.has(art)) continue;
        seen.add(art);
        const name = c.Subtitle ? `${c.Name} - ${c.Subtitle}` : c.Name;
        cards.push({ name, set: c.Set || code.toUpperCase(), num: String(c.Number || ''), small: art, img: art, big: art,
          link: `https://swu-db.com/card/${c.Set || code}/${c.Number || ''}` });
      }
      await new Promise((ok) => setTimeout(ok, 200));
    }
    return { source: 'SWU-DB', cards };
  },
  async fab() {
    const all = await getJSON('https://raw.githubusercontent.com/the-fab-cube/flesh-and-blood-cards/develop/json/english/card.json');
    const cards = [], seen = new Set();
    for (const c of all) for (const p of c.printings || []) {
      if (!p.image_url || seen.has(p.image_url)) continue;
      seen.add(p.image_url);
      const name = c.color ? `${c.name} (${c.color})` : c.name;
      cards.push({ name, set: p.set_id, num: p.id, small: p.image_url, img: p.image_url, big: p.image_url,
        link: `https://fabrary.net/cards?query=${encodeURIComponent(c.name)}` });
    }
    return { source: 'the-fab-cube', cards };
  },
};
const { source, cards: listed } = await SOURCES[GAME]();
const cards = listed.slice(0, LIMIT);
console.log(GAME, cards.length, 'artworks');

// ---- 2. Fingerprint every card image ----
const data = new Uint8Array(cards.length * FP.RECORD);
const ok = new Uint8Array(cards.length);
const sampleIdx = new Set();
while (sampleIdx.size < Math.min(SAMPLE, cards.length)) sampleIdx.add(Math.floor(Math.random() * cards.length));
const sampleBufs = new Map();
let queue = [...cards.keys()], done = 0;
async function worker(tries, until = Infinity) {
  while (queue.length && Date.now() < until) {
    const i = queue.shift();
    const buf = await getBuf(cards[i].small, tries);
    if (buf) {
      try { data.set(await fingerprint(buf), i * FP.RECORD); ok[i] = 1; if (sampleIdx.has(i)) sampleBufs.set(i, buf); } catch { /* bad image */ }
    }
    if (++done % 2000 === 0) console.log(done, '/', cards.length);
  }
}
await Promise.all(Array.from({ length: 16 }, () => worker(4)));
// Some hosts (SWU-DB's) throttle bursts: retry the misses slowly.
queue = [...cards.keys()].filter((i) => !ok[i]);
if (queue.length) {
  console.log('retrying', queue.length, 'images that failed:', JSON.stringify(failures));
  const until = Date.now() + 15 * 60e3; // never let the retries hold up the other games
  await Promise.all(Array.from({ length: 4 }, () => worker(2, until)));
  console.log('still missing', [...ok].filter((x) => !x).length, 'e.g.', cards.find((c, i) => !ok[i])?.small);
}

// Keep only cards that fingerprinted.
const keep = [...ok.keys()].filter((i) => ok[i]);
const outData = new Uint8Array(keep.length * FP.RECORD);
keep.forEach((i, k) => outData.set(data.subarray(i * FP.RECORD, (i + 1) * FP.RECORD), k * FP.RECORD));
const meta = keep.map((i) => GAME === 'mtg' ? [cards[i].name, cards[i].set, cards[i].num, cards[i].id, cards[i].formats]
  : [cards[i].name, cards[i].set, cards[i].num, cards[i].img, cards[i].big, cards[i].link]);
const index = { data: outData, meta };
await mkdir('data', { recursive: true });
console.log('wrote', meta.length, 'cards,', outData.length, 'bytes');

// ---- 3. Self-test on degraded copies ----
const pos = new Map(keep.map((i, k) => [i, k]));
const rnd = (a, b) => a + Math.random() * (b - a);
async function degrade(buf, height) {
  const img = sharp(buf);
  const { width, height: h } = await img.metadata();
  const m = Math.round(h * 0.03); // detection boxes include a little background
  const withMargin = await img.extend({ top: m, bottom: m, left: m, right: m, background: { r: 40, g: 60, b: 50 } }).toBuffer();
  const w = Math.round(height * (width + 2 * m) / (h + 2 * m));
  return sharp(withMargin).resize(w, height).blur(rnd(0.5, 1.2)).modulate({ brightness: rnd(0.75, 1.25), saturation: rnd(0.8, 1.2) })
    .jpeg({ quality: 45 }).toBuffer();
}
const heights = [32, 48, 72, 120];
const weights = [0.25, 0.5, 1, 1.5, 2, 3];
const per = () => Object.fromEntries(weights.map((w) => [w, []]));
const results = Object.fromEntries(heights.map((h) => [h, { n: 0, hit: Object.fromEntries(weights.map((w) => [w, 0])), dHit: per(), margin: per() }]));
for (const [i, buf] of sampleBufs) {
  if (!pos.has(i)) continue;
  for (const h of heights) {
    let desc;
    try { desc = await fingerprint(await degrade(buf, h)); } catch { continue; }
    const R = results[h]; R.n++;
    for (const w of weights) {
      const best = FP.search(index, desc, 2, w);
      const hit = meta[best[0].i][0] === cards[i].name;
      if (hit) { R.hit[w]++; R.dHit[w].push(best[0].d); if (best[1]) R.margin[w].push(best[1].d - best[0].d); }
    }
  }
}
// Non-cards: card-shaped crops of something else (part of a card stretched, or plain noise).
const nonCard = per();
let k = 0;
for (const [, buf] of sampleBufs) {
  if (k++ >= 300) break;
  const img = sharp(buf), { width, height } = await img.metadata();
  const part = k % 2 ? { left: 0, top: Math.round(height * 0.55), width, height: Math.round(height * 0.45) }
    : { left: Math.round(width * 0.3), top: Math.round(height * 0.2), width: Math.round(width * 0.5), height: Math.round(height * 0.3) };
  let desc;
  try { desc = await fingerprint(await img.extract(part).resize(64, 88, { fit: 'fill' }).blur(0.8).toBuffer()); } catch { continue; } // odd-sized scan
  for (const w of weights) nonCard[w].push(FP.search(index, desc, 1, w)[0].d);
}
const pct = (arr, p) => { if (!arr.length) return '-'; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1); };
// Pick the colour weight with the best average accuracy, then a distance cut-off that keeps
// most true matches at typical stream sizes while rejecting most non-cards.
const acc = (w) => heights.reduce((a, h) => a + results[h].hit[w] / results[h].n, 0) / heights.length;
const weight = weights.reduce((a, b) => (acc(b) > acc(a) ? b : a));
const hits = [...results[48].dHit[weight], ...results[72].dHit[weight]];
const maxDist = Math.min(Number(pct(hits, 0.95)), Number(pct(nonCard[weight], 0.05)));
await writeFile(`data/${GAME}.bin`, outData); // written together, so a failed run leaves the old pair
await writeFile(`data/${GAME}.json`, JSON.stringify({ built: new Date().toISOString(), game: GAME, source, record: FP.RECORD,
  count: meta.length, weight, maxDist, minMargin: 1, ...(GAME === 'mtg' ? { formats: FORMATS } : {}), cards: meta }));

let md = `## Picture index: ${GAME}\n\n${meta.length} artworks, ${(outData.length / 1e6).toFixed(1)} MB. Chosen colour weight ${weight}, max distance ${maxDist}.\n\n`;
md += `### Top-1 accuracy on degraded cards (by card height in px)\n\n| height | n | ${weights.map((w) => 'w=' + w).join(' | ')} | dist p50 / p95 (hits, chosen w) | margin p10 |\n|---|---|${weights.map(() => '---').join('|')}|---|---|\n`;
for (const h of heights) {
  const R = results[h];
  md += `| ${h} | ${R.n} | ${weights.map((w) => (100 * R.hit[w] / R.n).toFixed(1) + '%').join(' | ')} | ${pct(R.dHit[weight], 0.5)} / ${pct(R.dHit[weight], 0.95)} | ${pct(R.margin[weight], 0.1)} |\n`;
}
md += `\nNon-card crops, best distance (chosen w): p05 ${pct(nonCard[weight], 0.05)}, p50 ${pct(nonCard[weight], 0.5)}, p90 ${pct(nonCard[weight], 0.9)}\n`;
const kept = (h) => results[h].dHit[weight].filter((d) => d <= maxDist).length / results[h].n;
md += `\nShare of cards identified correctly *and* under the cut-off: ${heights.map((h) => `${h}px ${(100 * kept(h)).toFixed(1)}%`).join(', ')}\n`;
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
await writeFile(`data/${GAME}-selftest.md`, md);
