// Downloads a random sample of card images from several games, for generating detector
// training tables (tools/detector/synth.py). Runs in GitHub Actions (fetch-training-cards.yml),
// which publishes the result as the `training-cards` branch. Node 20+, no dependencies.
// Usage: node tools/detector/fetch-cards.mjs OUT_DIR
import { mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const OUT = process.argv[2] || 'training-cards';
const UA = { 'User-Agent': 'CardZoom/0.1 (github.com/Splickety404/card-zoom)', Accept: 'application/json' };
const pick = (arr, n) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
async function getJSON(url) { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }
async function getBuf(url) {
  for (let t = 0; t < 4; t++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': UA['User-Agent'] } }); if (r.ok) return Buffer.from(await r.arrayBuffer()); if (r.status === 404) return null; } catch {}
    await new Promise((ok) => setTimeout(ok, 500 * 2 ** t));
  }
  return null;
}
async function download(game, urls) {
  await mkdir(`${OUT}/${game}`, { recursive: true });
  let next = 0, n = 0;
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (next < urls.length) {
      const i = next++, buf = await getBuf(urls[i]);
      if (buf && buf.length > 2000) { await writeFile(`${OUT}/${game}/${String(i).padStart(5, '0')}.jpg`, buf); n++; }
    }
  }));
  console.log(game, n, 'images');
}

const sources = {
  async mtg() {
    const bulk = await getJSON('https://api.scryfall.com/bulk-data');
    const e = bulk.data.find((b) => b.type === 'unique_artwork');
    let cards;
    if (e.download_uri) cards = await getJSON(e.download_uri);
    else {
      let buf = Buffer.from(await (await fetch(e.jsonl_download_uri, { headers: UA })).arrayBuffer());
      if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
      cards = buf.toString('utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
    }
    const urls = cards.map((c) => (c.image_uris || c.card_faces?.[0]?.image_uris)?.small).filter(Boolean);
    return pick(urls, 3000);
  },
  async pokemon() {
    const urls = [];
    for (const page of pick([...Array(70).keys()].map((p) => p + 1), 6)) {
      try { const j = await getJSON(`https://api.pokemontcg.io/v2/cards?page=${page}&pageSize=250&select=id,images`); urls.push(...j.data.map((c) => c.images?.small).filter(Boolean)); } catch (e) { console.log('pokemon page', page, e.message); }
    }
    return pick(urls, 700);
  },
  async yugioh() {
    const j = await getJSON('https://db.ygoprodeck.com/api/v7/cardinfo.php');
    return pick(j.data.map((c) => c.card_images?.[0]?.image_url_small).filter(Boolean), 500);
  },
  async lorcana() {
    const sets = await getJSON('https://api.lorcast.com/v0/sets');
    const urls = [];
    for (const s of sets.results || []) {
      try { const j = await getJSON(`https://api.lorcast.com/v0/sets/${s.id}/cards`); urls.push(...j.map((c) => c.image_uris?.digital?.small).filter(Boolean)); } catch {}
      await new Promise((ok) => setTimeout(ok, 120));
    }
    return pick(urls, 300);
  },
};
for (const [game, fn] of Object.entries(sources)) {
  try { await download(game, await fn()); } catch (e) { console.log(game, 'failed:', e.message); }
}
