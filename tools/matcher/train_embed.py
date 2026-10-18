"""Train a card picture embedding that survives broadcast conditions.

Every card scan in CARDS (folders of images, one card per file) is a class. Each training
sample is that scan put through what a stream does to a card on a table: a loose detector box,
a coloured sleeve, glare (spots and washes), shrinking to 30-120 px tall, blur, colour casts and
heavy JPEG. A MobileNetV3 (ImageNet weights) learns to map every such view close to the clean
scan's embedding, so the page can index clean scans once and match broken views against them.

    python train_embed.py CARDS --weights mnv3l.pth --out embed.onnx [--epochs 12] [--holdout 400]

Held-out cards are never trained on; the script reports top-1 retrieval for them (degraded view
vs. all clean scans) next to the picture-hash fingerprint's on the same views.
"""
import argparse, glob, json, math, os, random, subprocess, sys, time

import numpy as np
import torch, torch.nn as nn, torch.nn.functional as Fn
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
import io

W, H = 96, 128  # network input, upright card


def load_cards(root):
    files = sorted(f for f in glob.glob(os.path.join(root, '**', '*'), recursive=True)
                   if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')))
    imgs = []
    for f in files:
        im = Image.open(f).convert('RGB')
        if im.width > im.height: im = im.rotate(90, expand=True)
        imgs.append(im.resize((146, 204), Image.BICUBIC))
    return files, imgs


def glare(im, rng):
    """Specular highlights: soft white ellipses, sometimes a broad wash over part of the card."""
    w, h = im.size
    layer = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(layer)
    for _ in range(rng.randint(1, 3)):
        rx, ry = rng.uniform(0.1, 0.6) * w, rng.uniform(0.05, 0.4) * h
        cx, cy = rng.uniform(0, w), rng.uniform(0, h)
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=int(rng.uniform(90, 255)))
    layer = layer.filter(ImageFilter.GaussianBlur(rng.uniform(4, 18)))
    white = Image.new('RGB', (w, h), tuple(int(rng.uniform(225, 255)) for _ in range(3)))
    return Image.composite(white, im, layer)


def degrade(card, rng, hard=True):
    """One broadcast-like view of a clean scan, returned as a W x H crop."""
    im = card.copy()
    # Sleeve: coloured border plus a faint glossy sheen.
    if rng.random() < 0.6:
        b = int(rng.uniform(2, 9))
        col = tuple(int(rng.uniform(0, 255)) for _ in range(3))
        sl = Image.new('RGB', (im.width + 2 * b, im.height + 2 * b), col)
        sl.paste(im, (b, b)); im = sl.resize(card.size, Image.BICUBIC)
    if rng.random() < (0.7 if hard else 0.3): im = glare(im, rng)
    if rng.random() < 0.25:  # partly covered from one edge: a card on top of it, a hand
        w, h = im.size; d = ImageDraw.Draw(im); f = rng.uniform(0.1, 0.4)
        col = tuple(int(rng.uniform(0, 255)) for _ in range(3))
        edge = rng.randrange(4)
        box = [(0, 0, w, f * h), (0, (1 - f) * h, w, h), (0, 0, f * w, h), ((1 - f) * w, 0, w, h)][edge]
        d.rectangle(box, fill=col)
    if rng.random() < 0.3:  # washed out by light across the whole card
        im = Image.blend(im, Image.new('RGB', im.size, (235, 235, 235)), rng.uniform(0.1, 0.45))
    # On a table: random background, small tilt and perspective, then a loose detector box.
    bg = Image.new('RGB', (int(im.width * 1.6), int(im.height * 1.6)), tuple(int(rng.uniform(0, 120)) for _ in range(3)))
    ang = rng.uniform(-6, 6)
    rot = im.convert('RGBA').rotate(ang, expand=True, resample=Image.BICUBIC)
    ox, oy = (bg.width - rot.width) // 2, (bg.height - rot.height) // 2
    bg.paste(rot, (ox, oy), rot)
    cx, cy = bg.width / 2 + rng.uniform(-0.05, 0.05) * im.width, bg.height / 2 + rng.uniform(-0.05, 0.05) * im.height
    s = rng.uniform(0.92, 1.1)
    bw, bh = im.width * s, im.height * s
    crop = bg.crop((int(cx - bw / 2), int(cy - bh / 2), int(cx + bw / 2), int(cy + bh / 2)))
    # Stream resolution: shrink to 30-120 px tall, blur, colour cast, heavy JPEG, then back up.
    th = int(rng.uniform(30, 120) if hard else rng.uniform(60, 140))
    small = crop.resize((max(8, int(th * crop.width / crop.height)), th), Image.BILINEAR)
    if rng.random() < 0.7: small = small.filter(ImageFilter.GaussianBlur(rng.uniform(0.3, 1.4)))
    small = ImageEnhance.Brightness(small).enhance(rng.uniform(0.6, 1.3))
    small = ImageEnhance.Contrast(small).enhance(rng.uniform(0.6, 1.2))
    small = ImageEnhance.Color(small).enhance(rng.uniform(0.6, 1.3))
    arr = np.asarray(small).astype(np.float32) * np.array([rng.uniform(0.85, 1.15) for _ in range(3)], np.float32)
    small = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    buf = io.BytesIO(); small.save(buf, 'JPEG', quality=int(rng.uniform(15, 60))); buf.seek(0)
    return Image.open(buf).convert('RGB').resize((W, H), Image.BILINEAR)


def clean(card):
    return card.resize((W, H), Image.BILINEAR)


def to_tensor(ims):
    a = np.stack([np.asarray(i, np.float32) / 255 for i in ims])  # N,H,W,3
    return torch.from_numpy(a).permute(0, 3, 1, 2).contiguous()


class Embed(nn.Module):
    """MobileNetV3 features -> 128-d unit vector. Input: N,3,H,W in 0..1 RGB."""
    def __init__(self, weights=None, dim=128):
        super().__init__()
        import timm
        self.body = timm.create_model('mobilenetv3_large_100', pretrained=False, num_classes=0)
        if weights:
            sd = torch.load(weights, map_location='cpu')
            self.body.load_state_dict({k: v for k, v in sd.items() if not k.startswith('classifier')}, strict=False)
        with torch.no_grad(): feat = self.body(torch.zeros(1, 3, H, W)).shape[1]
        self.head = nn.Linear(feat, dim)
        self.register_buffer('mean', torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1))
        self.register_buffer('std', torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1))

    def forward(self, x):
        return Fn.normalize(self.head(self.body((x - self.mean) / self.std)), dim=1)


class CosFace(nn.Module):
    def __init__(self, n, dim=128, s=30.0, m=0.25):
        super().__init__()
        self.w = nn.Parameter(torch.randn(n, dim) * 0.01); self.s, self.m = s, m

    def forward(self, e, y):
        logits = e @ Fn.normalize(self.w, dim=1).t()
        logits = logits - self.m * Fn.one_hot(y, logits.shape[1])
        return Fn.cross_entropy(self.s * logits, y)


class Views(torch.utils.data.Dataset):
    def __init__(self, imgs, ids, per_epoch):
        self.imgs, self.ids, self.n = imgs, ids, per_epoch
    def __len__(self): return self.n
    def __getitem__(self, k):
        rng = random.Random()
        c = rng.choice(self.ids)
        im = clean(self.imgs[c]) if rng.random() < 0.15 else degrade(self.imgs[c], rng, hard=rng.random() < 0.8)
        return to_tensor([im])[0], c


@torch.no_grad()
def embed_all(model, ims, bs=128):
    model.eval(); out = []
    for i in range(0, len(ims), bs): out.append(model(to_tensor(ims[i:i + bs])))
    return torch.cat(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cards'); ap.add_argument('--weights'); ap.add_argument('--out', default='embed.onnx')
    ap.add_argument('--epochs', type=int, default=12); ap.add_argument('--per-epoch', type=int, default=24000)
    ap.add_argument('--holdout', type=int, default=400); ap.add_argument('--bs', type=int, default=64)
    ap.add_argument('--evalviews', default='')
    a = ap.parse_args()
    torch.set_num_threads(4)
    files, imgs = load_cards(a.cards)
    rng = random.Random(1)
    order = list(range(len(imgs))); rng.shuffle(order)
    hold, train = sorted(order[:a.holdout]), sorted(order[a.holdout:])
    print(len(imgs), 'cards,', len(train), 'train,', len(hold), 'held out', flush=True)
    # Fixed degraded views of held-out cards for evaluation (same views for every method).
    erng = random.Random(7)
    evq = [(c, degrade(imgs[c], erng, hard=True)) for c in hold for _ in range(2)]
    if a.evalviews:
        os.makedirs(a.evalviews, exist_ok=True)
        for k, (c, im) in enumerate(evq): im.save(os.path.join(a.evalviews, f'{k:04d}_{c:05d}.png'))
        json.dump([os.path.relpath(f, a.cards) for f in files], open(os.path.join(a.evalviews, 'files.json'), 'w'))

    model = Embed(a.weights); crit = CosFace(len(imgs))
    opt = torch.optim.AdamW([{'params': model.body.parameters(), 'lr': 5e-4}, {'params': list(model.head.parameters()) + list(crit.parameters()), 'lr': 3e-3}], weight_decay=1e-4)
    steps = a.epochs * (a.per_epoch // a.bs)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=[5e-4, 3e-3], total_steps=steps, pct_start=0.1)
    dl = torch.utils.data.DataLoader(Views(imgs, train, a.per_epoch), batch_size=a.bs, num_workers=3, drop_last=True, persistent_workers=True)

    def evaluate():
        g = embed_all(model, [clean(i) for i in imgs])
        q = embed_all(model, [im for _, im in evq])
        sims = q @ g.t()
        top = sims.argmax(1).tolist()
        acc = sum(t == c for t, (c, _) in zip(top, evq)) / len(evq)
        model.train(); return acc

    print('epoch 0 held-out top-1', round(evaluate(), 3), flush=True)
    for ep in range(1, a.epochs + 1):
        t0, tot, n = time.time(), 0, 0
        model.train()
        for x, y in dl:
            loss = crit(model(x), y)
            opt.zero_grad(); loss.backward(); opt.step(); sched.step()
            tot += loss.item(); n += 1
        print(f'epoch {ep} loss {tot / n:.3f} held-out top-1 {evaluate():.3f} ({time.time() - t0:.0f}s)', flush=True)
        torch.save(model.state_dict(), a.out + '.pt')
    model.eval()
    torch.onnx.export(model, torch.zeros(1, 3, H, W), a.out, input_names=['image'], output_names=['embedding'],
                      dynamic_axes={'image': {0: 'n'}, 'embedding': {0: 'n'}}, opset_version=17, dynamo=False)
    print('wrote', a.out, flush=True)


if __name__ == '__main__':
    main()
