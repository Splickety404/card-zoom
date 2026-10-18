// Picture-hash baseline on the embedding trainer's held-out views (train_embed.py --evalviews DIR):
// the same degraded views, matched by core/fingerprint.js against every clean card, trying the
// page's scale and shift placements. Prints top-1 accuracy, overall and accepted-by-cut-off.
// Usage: node tools/matcher/eval_hash.mjs CARDS VIEWS [weight]
import { createRequire } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const FP = require('../../core/fingerprint.js');
const [cards, views, w = '2'] = process.argv.slice(2);
const weight = Number(w);
const files = JSON.parse(await readFile(path.join(views, 'files.json'), 'utf8'));

async function fp(input, extract) {
  let img = sharp(input);
  const meta = await img.metadata();
  if (!extract && meta.width > meta.height) img = img.rotate(90);
  if (extract) img = img.extract(extract);
  const raw = await img.resize(FP.FW, FP.FH, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  return FP.describe(raw, 3);
}
const data = new Uint8Array(files.length * FP.RECORD);
for (let i = 0; i < files.length; i++) data.set(await fp(path.join(cards, files[i])), i * FP.RECORD);
const index = { data, meta: files.map((f) => [f]) };

const list = (await readdir(views)).filter((f) => f.endsWith('.png'));
let hit = 0, n = 0;
const ds = [];
for (const f of list) {
  const truth = Number(f.split('_')[1].slice(0, 5));
  const file = path.join(views, f), { width: W, height: H } = await sharp(file).metadata();
  let best = null;
  for (const s of [0.88, 0.94, 1]) for (const dx of [-0.04, 0, 0.04]) for (const dy of [-0.04, 0, 0.04]) {
    const ew = Math.round(W * s), eh = Math.round(H * s);
    const left = Math.max(0, Math.min(W - ew, Math.round((W - ew) / 2 + dx * W))), top = Math.max(0, Math.min(H - eh, Math.round((H - eh) / 2 + dy * H)));
    const r = FP.search(index, await fp(file, { left, top, width: ew, height: eh }), 2, weight);
    if (!best || r[0].d < best[0].d) best = r;
  }
  n++; if (best[0].i === truth) hit++;
  ds.push(best[0].d);
}
console.log(`picture hash: ${list.length} views, top-1 ${(hit / n).toFixed(3)}`);
