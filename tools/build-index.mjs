// Builds the Magic picture index (data/mtg.bin + data/mtg.json) from Scryfall, then self-tests it
// on degraded copies of real cards (small, blurred, recompressed, re-lit) and reports accuracy.
// Runs in GitHub Actions (.github/workflows/build-index.yml). Needs Node 20+ and `sharp`.
// Usage: node tools/build-index.mjs [--limit N]
import { createRequire } from 'node:module';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const FP = require('../core/fingerprint.js');
const UA = { 'User-Agent': 'CardZoom/0.1 (github.com/Splickety404/card-zoom)', Accept: 'application/json' };
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const SAMPLE = 800;

async function getJSON(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
async function getBuf(url, tries = 4) {
  for (let t = 0; ; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA['User-Agent'] } });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      if (r.status === 404) return null;
      throw new Error(String(r.status));
    } catch (e) {
      if (t >= tries) return null;
      await new Promise((ok) => setTimeout(ok, 500 * 2 ** t));
    }
  }
}
async function fingerprint(buf) {
  const raw = await sharp(buf).resize(FP.FW, FP.FH, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  return FP.describe(raw, 3);
}

// ---- 1. Card list: one entry per artwork ----
const bulk = await getJSON('https://api.scryfall.com/bulk-data');
const entry = bulk.data.find((b) => b.type === 'unique_artwork') || bulk.data.find((b) => b.type === 'default_cards');
console.log('bulk entry:', JSON.stringify(entry).slice(0, 600));
// The list entry normally carries download_uri; if not, its own uri returns the full entry.
const full = entry.download_uri ? entry : await getJSON(entry.uri);
const all = await getJSON(full.download_uri);
const cards = all.filter((c) => c.layout !== 'art_series' && (c.image_uris || c.card_faces?.[0]?.image_uris))
  .slice(0, LIMIT)
  .map((c) => ({
    name: c.card_faces?.length && !c.image_uris ? c.card_faces[0].name : c.name,
    set: c.set, num: c.collector_number, id: c.id,
    small: (c.image_uris || c.card_faces[0].image_uris).small,
  }));
console.log(cards.length, 'artworks');

// ---- 2. Fingerprint every card image ----
const data = new Uint8Array(cards.length * FP.RECORD);
const ok = new Uint8Array(cards.length);
const sampleIdx = new Set();
while (sampleIdx.size < Math.min(SAMPLE, cards.length)) sampleIdx.add(Math.floor(Math.random() * cards.length));
const sampleBufs = new Map();
let next = 0, done = 0;
async function worker() {
  while (next < cards.length) {
    const i = next++;
    const buf = await getBuf(cards[i].small);
    if (buf) {
      try { data.set(await fingerprint(buf), i * FP.RECORD); ok[i] = 1; if (sampleIdx.has(i)) sampleBufs.set(i, buf); } catch { /* bad image */ }
    }
    if (++done % 2000 === 0) console.log(done, '/', cards.length);
  }
}
await Promise.all(Array.from({ length: 16 }, worker));

// Keep only cards that fingerprinted.
const keep = [...ok.keys()].filter((i) => ok[i]);
const outData = new Uint8Array(keep.length * FP.RECORD);
keep.forEach((i, k) => outData.set(data.subarray(i * FP.RECORD, (i + 1) * FP.RECORD), k * FP.RECORD));
const meta = keep.map((i) => [cards[i].name, cards[i].set, cards[i].num, cards[i].id]);
const index = { data: outData, meta };
await mkdir('data', { recursive: true });
await writeFile('data/mtg.bin', outData);
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
const weights = [0, 0.1, 0.25, 0.5, 1];
const per = () => Object.fromEntries(weights.map((w) => [w, []]));
const results = Object.fromEntries(heights.map((h) => [h, { n: 0, hit: Object.fromEntries(weights.map((w) => [w, 0])), dHit: per(), margin: per() }]));
for (const [i, buf] of sampleBufs) {
  if (!pos.has(i)) continue;
  for (const h of heights) {
    const desc = await fingerprint(await degrade(buf, h));
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
  const crop = await img.extract(part).resize(64, 88, { fit: 'fill' }).blur(0.8).toBuffer();
  const desc = await fingerprint(crop);
  for (const w of weights) nonCard[w].push(FP.search(index, desc, 1, w)[0].d);
}
const pct = (arr, p) => { if (!arr.length) return '-'; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1); };
// Pick the colour weight with the best average accuracy, then a distance cut-off that keeps
// most true matches at typical stream sizes while rejecting most non-cards.
const acc = (w) => heights.reduce((a, h) => a + results[h].hit[w] / results[h].n, 0) / heights.length;
const weight = weights.reduce((a, b) => (acc(b) > acc(a) ? b : a));
const hits = [...results[48].dHit[weight], ...results[72].dHit[weight]];
const maxDist = Math.min(Number(pct(hits, 0.95)), Number(pct(nonCard[weight], 0.05)));
await writeFile('data/mtg.json', JSON.stringify({ built: new Date().toISOString(), source: 'Scryfall unique_artwork', record: FP.RECORD,
  count: meta.length, weight, maxDist, minMargin: 1, cards: meta }));

let md = `## Magic picture index\n\n${meta.length} artworks, ${(outData.length / 1e6).toFixed(1)} MB. Chosen colour weight ${weight}, max distance ${maxDist}.\n\n`;
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
await writeFile('data/mtg-selftest.md', md);
