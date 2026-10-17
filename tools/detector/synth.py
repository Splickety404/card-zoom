"""Generates synthetic broadcast frames of card game tables, with an oriented box for every card,
for training the card detector (tools/detector/train.py).

Each frame is a playmat (texture, logos, bands) inside broadcast furniture (webcam boxes, score
bars, captions), with cards laid out the way players do: battlefield rows (some tapped, the far
side upside down), fanned and overlapping clusters, piles, a hand-held or overlay card. Cards get
sleeves, glare, shadows and slight tilt; the frame gets blur, noise and heavy JPEG.

Labels are YOLO OBB: `0 x1 y1 x2 y2 x3 y3 x4 y4` (normalised corners of the whole card, also
where it is covered). Cards less than a third visible are not labelled.

Usage: python synth.py CARDS_DIR OUT_DIR --train 4000 --val 300 [--seed 1]
CARDS_DIR holds card images in sub-folders (the training-cards branch).
"""
import argparse, math, os, random, glob
import numpy as np
import cv2

W, H = 1280, 720
CARD_AR = 88 / 63
WORDS = ['CHAMPIONSHIP', 'REGIONAL', 'MAGIC', 'ROUND 7', 'FINALS', 'LIVE', 'POKEMON', 'OPEN', 'TOP 8',
         'Here is the play', 'two triggers and', 'attacks with', 'GAME 2', '20', '14', 'IZZET PROWESS', 'MONO RED']


def rnd(a, b):
    return random.uniform(a, b)


def load_cards(root):
    paths = glob.glob(os.path.join(root, '**', '*.jpg'), recursive=True) + glob.glob(os.path.join(root, '**', '*.png'), recursive=True)
    cards = []
    for p in paths:
        im = cv2.imread(p, cv2.IMREAD_COLOR)
        if im is None or im.shape[0] < 60:
            continue
        h, w = im.shape[:2]
        if w > h:  # landscape scans (split cards, battles): stand them up
            im = cv2.rotate(im, cv2.ROTATE_90_CLOCKWISE)
        cards.append(im)
    return cards


# ---------- backgrounds ----------
def noise_texture(h, w, scale, amp):
    small = np.random.randn(max(2, h // scale), max(2, w // scale)).astype(np.float32)
    return cv2.resize(small, (w, h), interpolation=cv2.INTER_CUBIC) * amp


def put_text(img, text, org, size, color, thick):
    mask = np.zeros(img.shape[:2], np.uint8)  # putText only draws on 8-bit images
    cv2.putText(mask, text, org, random.choice([cv2.FONT_HERSHEY_SIMPLEX, cv2.FONT_HERSHEY_DUPLEX, cv2.FONT_HERSHEY_TRIPLEX]),
                size, 255, thick, cv2.LINE_AA)
    a = (mask.astype(np.float32) / 255)[..., None]
    img[:] = img * (1 - a) + np.array(color, np.float32) * a


def playmat(h, w, cards):
    base = np.array([rnd(5, 70), rnd(5, 70), rnd(5, 70)], np.float32)
    if random.random() < 0.3:
        base = np.array([rnd(60, 160)] * 3, np.float32) * np.array([rnd(.7, 1.1), rnd(.7, 1.1), rnd(.7, 1.1)])
    img = np.ones((h, w, 3), np.float32) * base
    img += noise_texture(h, w, random.choice([8, 30, 120]), rnd(3, 18))[..., None]
    for _ in range(random.randint(0, 4)):  # soft blobs / printed art
        c = np.array([rnd(0, 255) for _ in range(3)], np.float32)
        mask = np.zeros((h, w), np.float32)
        cv2.ellipse(mask, (random.randint(0, w), random.randint(0, h)), (random.randint(40, 400), random.randint(40, 300)),
                    rnd(0, 180), 0, 360, 1, -1)
        mask = cv2.GaussianBlur(mask, (0, 0), rnd(10, 60))[..., None] * rnd(0.15, 0.6)
        img = img * (1 - mask) + c * mask
    if random.random() < 0.5:  # a band across the mat
        y, bh = random.randint(0, h), random.randint(20, 90)
        c = np.array([rnd(0, 255) for _ in range(3)], np.float32)
        img[max(0, y):y + bh] = img[max(0, y):y + bh] * 0.3 + c * 0.7
    if random.random() < 0.3 and cards:  # big faded artwork printed on the mat
        art = random.choice(cards)
        ah, aw = art.shape[:2]
        art = art[int(ah * .12):int(ah * .55), int(aw * .08):int(aw * .92)]
        art = cv2.resize(art, (w, h)).astype(np.float32)
        a = rnd(0.15, 0.45)
        img = img * (1 - a) + art * a
    for _ in range(random.randint(0, 3)):  # logo text
        put_text(img, random.choice(WORDS), (random.randint(0, w // 2), random.randint(60, h)), rnd(1.5, 4),
                 tuple(rnd(120, 255) for _ in range(3)), random.randint(3, 10))
    if random.random() < 0.5:  # shield-shaped logo
        cx, cy, s = random.randint(200, w - 200), random.randint(150, h - 150), random.randint(60, 160)
        pts = np.array([[cx - s, cy - s], [cx + s, cy - s], [cx + s, cy + s // 3], [cx, cy + s], [cx - s, cy + s // 3]], np.int32)
        cv2.fillPoly(img, [pts], tuple(rnd(0, 255) for _ in range(3)))
        cv2.polylines(img, [pts], True, tuple(rnd(150, 255) for _ in range(3)), random.randint(2, 8))
    # vignette / uneven lighting
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    lx, ly = rnd(0, w), rnd(0, h)
    light = 1 + rnd(0, 0.5) * np.exp(-(((xx - lx) / (w * rnd(.3, .8))) ** 2 + ((yy - ly) / (h * rnd(.3, .8))) ** 2))
    return np.clip(img * light[..., None] * rnd(0.7, 1.2), 0, 255)


# ---------- clutter that is not a card ----------
def clutter(img, occ):
    h, w = img.shape[:2]
    for _ in range(random.randint(0, 5)):
        kind = random.random()
        x, y = random.randint(0, w - 40), random.randint(0, h - 40)
        if kind < 0.3:  # notepad / life pad: white with ruled lines
            pw, ph = random.randint(60, 200), random.randint(80, 220)
            cv2.rectangle(img, (x, y), (x + pw, y + ph), tuple(rnd(200, 250) for _ in range(3)), -1)
            for ly in range(y + 12, y + ph, random.randint(8, 16)):
                cv2.line(img, (x + 4, ly), (x + pw - 4, ly), (rnd(100, 180),) * 3, 1)
        elif kind < 0.5:  # die
            s = random.randint(14, 36)
            cv2.rectangle(img, (x, y), (x + s, y + s), tuple(rnd(150, 255) for _ in range(3)), -1)
            cv2.circle(img, (x + s // 2, y + s // 2), max(2, s // 8), (20, 20, 20), -1)
        elif kind < 0.7:  # deck box / sleeve stack seen from above
            pw, ph = random.randint(50, 140), random.randint(50, 140)
            cv2.rectangle(img, (x, y), (x + pw, y + ph), tuple(rnd(0, 255) for _ in range(3)), -1)
        elif kind < 0.85:  # pen
            cv2.line(img, (x, y), (x + random.randint(-150, 150), y + random.randint(-150, 150)), (rnd(150, 240),) * 3, random.randint(5, 12))
        else:  # blank square counters / tokens
            r = random.randint(8, 25)
            cv2.circle(img, (x, y), r, tuple(rnd(0, 255) for _ in range(3)), -1)


def broadcast_furniture(frame, cards):
    """Webcams, score bars and captions drawn over the table (they hide cards beneath)."""
    h, w = frame.shape[:2]
    boxes = []
    if random.random() < 0.6:  # side column: webcams + overlay card
        cw = random.randint(int(w * .16), int(w * .26))
        side = random.choice(['l', 'r'])
        x0 = 0 if side == 'l' else w - cw
        frame[:, x0:x0 + cw] = np.array([rnd(0, 60)] * 3)
        boxes.append((x0, 0, cw, h))
        for y0 in [random.randint(0, 30), h - int(cw * 0.6) - random.randint(0, 40)]:
            webcam(frame, x0 + 4, y0, cw - 8, int(cw * 0.58), cards)
    if random.random() < 0.6:  # score bars
        for y0 in ([0] if random.random() < .5 else [0, h - 36]):
            bh = random.randint(22, 40)
            frame[y0:y0 + bh] = np.array([rnd(0, 80)] * 3) * np.array([rnd(.6, 1.4) for _ in range(3)])
            put_text(frame, random.choice(WORDS), (random.randint(10, w // 2), y0 + bh - 8), rnd(.5, .9), (240, 240, 240), 2)
            boxes.append((0, y0, w, bh))
    if random.random() < 0.35:  # floating webcam on the table
        cw = random.randint(160, 320)
        x0, y0 = random.randint(0, w - cw), random.randint(0, h - int(cw * .56))
        webcam(frame, x0, y0, cw, int(cw * 0.56), cards)
        boxes.append((x0, y0, cw, int(cw * .56)))
    if random.random() < 0.3:  # captions
        y0 = random.randint(int(h * .75), h - 60)
        frame[y0:y0 + 50, int(w * .2):int(w * .7)] *= 0.15
        put_text(frame, random.choice(WORDS), (int(w * .21), y0 + 36), rnd(.8, 1.2), (255, 255, 255), 2)
        boxes.append((int(w * .2), y0, int(w * .5), 50))
    return boxes


def webcam(frame, x, y, cw, ch, cards):
    """A person-ish blurry box: coloured background, head and shoulders blobs, a frame."""
    h, w = frame.shape[:2]
    x, y = max(0, x), max(0, y)
    cw, ch = min(cw, w - x), min(ch, h - y)
    if cw < 20 or ch < 20:
        return
    patch = np.ones((ch, cw, 3), np.float32) * np.array([rnd(30, 200) for _ in range(3)])
    patch += noise_texture(ch, cw, 6, 25)[..., None]
    for _ in range(random.randint(1, 3)):
        px = random.randint(0, cw)
        skin = np.array([rnd(60, 140), rnd(90, 170), rnd(130, 230)])
        cv2.ellipse(patch, (px, int(ch * rnd(.3, .6))), (int(cw * .08), int(ch * .2)), 0, 0, 360, skin.tolist(), -1)
        cv2.ellipse(patch, (px, ch), (int(cw * .2), int(ch * .35)), 0, 180, 360, [rnd(0, 255) for _ in range(3)], -1)
    patch = cv2.GaussianBlur(patch, (0, 0), rnd(1, 3))
    frame[y:y + ch, x:x + cw] = patch
    cv2.rectangle(frame, (x, y), (x + cw - 1, y + ch - 1), tuple(rnd(0, 255) for _ in range(3)), random.randint(1, 4))


# ---------- cards ----------
def card_back():
    ch = 204
    cw = int(ch / CARD_AR)
    im = np.ones((ch, cw, 3), np.uint8) * np.array([rnd(0, 255) for _ in range(3)], np.uint8)
    if random.random() < 0.5:
        cv2.ellipse(im, (cw // 2, ch // 2), (cw // 3, ch // 3), 0, 0, 360, [rnd(0, 255) for _ in range(3)], -1)
    return im


def render_card(src, ch, sleeve):
    """Card image at height ch (upright), with optional sleeve border, glare and rounded corners.
    Returns (rgba float image, inner card w/h in px) — the label covers the sleeve too."""
    cw = max(4, int(round(ch / CARD_AR)))
    im = cv2.resize(src, (cw, ch), interpolation=cv2.INTER_AREA).astype(np.float32)
    im = im * rnd(0.75, 1.15) + rnd(-15, 15)
    if sleeve:
        m = max(1, int(ch * rnd(0.015, 0.04)))
        col = np.array([rnd(0, 255) for _ in range(3)]) if random.random() < 0.6 else np.array([rnd(0, 40)] * 3)
        big = np.ones((ch + 2 * m, cw + 2 * m, 3), np.float32) * col
        big[m:m + ch, m:m + cw] = im * rnd(0.8, 1.0) + col * rnd(0, 0.15)
        im = big
    hh, ww = im.shape[:2]
    if random.random() < 0.6:  # glare: soft bright ellipse or streak
        g = np.zeros((hh, ww), np.float32)
        cv2.ellipse(g, (random.randint(0, ww), random.randint(0, hh)), (random.randint(ww // 6, ww), random.randint(hh // 10, hh // 2)),
                    rnd(0, 180), 0, 360, 1, -1)
        g = cv2.GaussianBlur(g, (0, 0), max(1, ww * rnd(0.05, 0.25)))[..., None] * rnd(0.3, 0.95)
        im = im * (1 - g) + 255 * g
    alpha = np.zeros((hh, ww), np.float32)
    r = max(1, int(ww * 0.05))
    cv2.rectangle(alpha, (r, 0), (ww - 1 - r, hh - 1), 1, -1)
    cv2.rectangle(alpha, (0, r), (ww - 1, hh - 1 - r), 1, -1)
    for cx, cy in [(r, r), (ww - 1 - r, r), (r, hh - 1 - r), (ww - 1 - r, hh - 1 - r)]:
        cv2.circle(alpha, (cx, cy), r, 1, -1)
    return np.dstack([np.clip(im, 0, 255), alpha])


class Table:
    def __init__(self, img):
        self.img = img
        self.occ = np.full(img.shape[:2], -1, np.int32)
        self.cards = []  # corners (4x2) per card id

    def place(self, rgba, cx, cy, angle, shadow=True):
        """Paste rgba centred at (cx, cy), rotated `angle` degrees clockwise."""
        hh, ww = rgba.shape[:2]
        M = cv2.getRotationMatrix2D((ww / 2, hh / 2), -angle, 1.0)
        M[0, 2] += cx - ww / 2
        M[1, 2] += cy - hh / 2
        h, w = self.img.shape[:2]
        corners = np.array([[0, 0], [ww, 0], [ww, hh], [0, hh]], np.float32)
        corners = (M[:, :2] @ corners.T).T + M[:, 2]
        # Warp and blend only inside the card's bounding box.
        x0, y0 = max(0, int(corners[:, 0].min()) - 8), max(0, int(corners[:, 1].min()) - 8)
        x1, y1 = min(w, int(corners[:, 0].max()) + 12), min(h, int(corners[:, 1].max()) + 12)
        if x1 <= x0 or y1 <= y0:
            self.cards.append((corners, 0.0))
            return len(self.cards) - 1
        Mr = M.copy()
        Mr[0, 2] -= x0
        Mr[1, 2] -= y0
        warped = cv2.warpAffine(rgba, Mr, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        a = warped[..., 3:4]
        roi = self.img[y0:y1, x0:x1]
        if shadow:
            sh = cv2.GaussianBlur(a[..., 0], (0, 0), max(1, ww * 0.04))
            sh = np.roll(np.roll(sh, int(ww * .03), 0), int(ww * .02), 1)[..., None] * rnd(0.2, 0.5)
            roi = roi * (1 - sh)
        self.img[y0:y1, x0:x1] = roi * (1 - a) + warped[..., :3] * a
        occ = self.occ[y0:y1, x0:x1]
        cid = len(self.cards)
        occ[a[..., 0] > 0.5] = cid
        self.cards.append((corners, float((a > 0.5).sum())))
        return cid

    def labels(self, hidden_boxes):
        for x, y, bw, bh in hidden_boxes:
            self.occ[y:y + bh, x:x + bw] = -2
        counts = np.bincount(self.occ[self.occ >= 0].ravel(), minlength=len(self.cards))
        out = []
        h, w = self.img.shape[:2]
        for cid, (corners, area) in enumerate(self.cards):
            if area < 1 or counts[cid] / area < 0.33:
                continue
            c = corners.copy()
            if c[:, 0].max() < 0 or c[:, 0].min() > w or c[:, 1].max() < 0 or c[:, 1].min() > h:
                continue
            c[:, 0] = np.clip(c[:, 0], 0, w) / w
            c[:, 1] = np.clip(c[:, 1], 0, h) / h
            out.append(c)
        return out


def lay_out(table, cards, ch):
    """Lay cards on the table in player-like groups."""
    h, w = table.img.shape[:2]
    pick = lambda: card_back() if random.random() < 0.05 else random.choice(cards)
    sleeve_col = random.random() < 0.8
    cw = ch / CARD_AR
    n_groups = random.randint(3, 8)
    for _ in range(n_groups):
        far = random.random() < 0.5
        base = 180 if far else 0
        gx, gy = rnd(0, w), rnd(0, h)
        kind = random.random()
        if kind < 0.4:  # a row of permanents, some tapped
            n, gap = random.randint(2, 6), rnd(0.05, 0.5) * cw
            ang0 = rnd(-6, 6)
            x = gx
            for _ in range(n):
                tapped = random.random() < 0.3
                a = base + ang0 + (90 if tapped else 0) + rnd(-4, 4)
                step = (ch if tapped else cw)
                table.place(render_card(pick(), ch, sleeve_col), x + step / 2, gy + rnd(-.05, .05) * ch, a)
                x += step + gap
        elif kind < 0.65:  # fanned / overlapping cluster (lands, attached cards, a hand)
            n = random.randint(2, 7)
            dx, dy = rnd(0.12, 0.45) * cw * random.choice([-1, 1]), rnd(-0.25, 0.25) * ch
            ang0, dang = rnd(-15, 15), rnd(-6, 6) if random.random() < 0.4 else rnd(-1.5, 1.5)
            for i in range(n):
                table.place(render_card(pick(), ch, sleeve_col), gx + i * dx, gy + i * dy, base + ang0 + i * dang)
        elif kind < 0.8:  # pile (library / graveyard): a few nearly aligned cards
            a = base + rnd(-10, 10)
            for i in range(random.randint(2, 5)):
                table.place(render_card(pick(), ch, sleeve_col), gx + rnd(-3, 3), gy + rnd(-3, 3), a + rnd(-3, 3))
        else:  # lone card at any angle
            table.place(render_card(pick(), ch, sleeve_col), gx, gy, base + rnd(-25, 25) + random.choice([0, 0, 90]))


def make_frame(cards):
    img = playmat(H, W, cards)
    clutter(img, None)
    table = Table(img)
    ch = int(H * rnd(0.07, 0.24))
    lay_out(table, cards, ch)
    if random.random() < 0.15:  # a card held up to a camera / big overlay card
        big = int(H * rnd(0.3, 0.6))
        table.place(render_card(random.choice(cards), big, random.random() < .5), rnd(big * .4, W - big * .4), rnd(big * .5, H - big * .5),
                    rnd(-8, 8), shadow=False)
    frame = table.img
    hidden = broadcast_furniture(frame, cards)
    if random.random() < 0.5 and hidden:  # overlay card in the side column (drawn on top, visible)
        x0, y0, bw, bh = hidden[0]
        if bh > H * 0.8 and bw > 120:
            oh = int(min(bw * 0.9 * CARD_AR, H * 0.4))
            cid = table.place(render_card(random.choice(cards), oh, False), x0 + bw / 2, H / 2, 0, shadow=False)
            frame = table.img
            hidden = [(x0, 0, bw, int(H / 2 - oh / 2) - 2), (x0, int(H / 2 + oh / 2) + 2, bw, H)] + hidden[1:]
    labels = table.labels(hidden)
    # camera: blur, noise, colour, jpeg, sometimes downscale-upscale
    frame = table.img
    if random.random() < 0.7:
        frame = cv2.GaussianBlur(frame, (0, 0), rnd(0.3, 1.4))
    frame = frame + np.random.randn(*frame.shape).astype(np.float32) * rnd(0, 6)
    frame = frame * np.array([rnd(.85, 1.15) for _ in range(3)])
    frame = np.clip(frame, 0, 255).astype(np.uint8)
    if random.random() < 0.4:
        s = rnd(0.4, 0.8)
        frame = cv2.resize(cv2.resize(frame, (int(W * s), int(H * s)), interpolation=cv2.INTER_AREA), (W, H))
    ok, enc = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, random.randint(25, 85)])
    return enc, labels


CARDS = []


def work(job):
    out, split, i, seed = job
    random.seed(seed)
    np.random.seed(seed % 2**32)
    enc, labels = make_frame(CARDS)
    enc.tofile(f'{out}/images/{split}/{i:05d}.jpg')
    with open(f'{out}/labels/{split}/{i:05d}.txt', 'w') as f:
        for c in labels:
            f.write('0 ' + ' '.join(f'{v:.5f}' for v in c.ravel()) + '\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cards')
    ap.add_argument('out')
    ap.add_argument('--train', type=int, default=4000)
    ap.add_argument('--val', type=int, default=300)
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--workers', type=int, default=os.cpu_count())
    a = ap.parse_args()
    CARDS.extend(load_cards(a.cards))
    print(len(CARDS), 'card images')
    jobs = []
    for split, n in [('train', a.train), ('val', a.val)]:
        os.makedirs(f'{a.out}/images/{split}', exist_ok=True)
        os.makedirs(f'{a.out}/labels/{split}', exist_ok=True)
        jobs += [(a.out, split, i, a.seed * 1000003 + len(jobs) + i) for i in range(n)]
    import multiprocessing as mp
    with mp.get_context('fork').Pool(a.workers) as pool:
        for k, _ in enumerate(pool.imap_unordered(work, jobs, chunksize=8)):
            if k % 500 == 0:
                print(k, '/', len(jobs), flush=True)
    with open(f'{a.out}/data.yaml', 'w') as f:
        f.write(f'path: {os.path.abspath(a.out)}\ntrain: images/train\nval: images/val\nnames:\n  0: card\n')


if __name__ == '__main__':
    main()
