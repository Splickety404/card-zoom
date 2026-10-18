# Card Zoom (prototype)

A web page that plays a Twitch or YouTube card game stream, finds the cards on screen, recognises them, and draws each card's crisp official scan where it lies on the table. Hover a card to see it at a readable size; click it to open its database page.

Live: https://splickety404.github.io/card-zoom/

## Run it

`card-zoom.html` is the whole app in one file (built from the sources by `python3 tools/build.py`; rebuild after editing). Opened straight from disk it runs, and local video files work, but stream embeds won't play.

Embeds need a real web origin (YouTube refuses `file://`, Twitch needs a `parent=` domain), so serve the folder:

```
cd card-zoom
python3 -m http.server 8000
```

Open http://localhost:8000, paste a stream link, press **Load**, then **Start capture** and pick **this tab** in the browser's share dialog.

To try it without a stream: **Open video file** and pick a recording. `?demo` shows a drawn table (its cards aren't real, so add `&debug` to see what is spotted).

`O` hides or shows the cards drawn over the video. `?debug` also outlines detections that weren't recognised; `?classic` uses the edge-based detector instead of the trained one. Hover a card and press × if something that isn't a card gets drawn; that area is ignored for the rest of the video.

## Can the page read the stream? (feasibility)

**Not directly.** A YouTube or Twitch player is a cross-origin iframe. The browser does not let the page read its pixels: there is no `<video>` element to draw onto a canvas, and neither site offers a frame API. This is a hard browser security rule, not something an API key fixes.

What does work:

| Route | Works for | Trade-off |
|---|---|---|
| **Tab capture** (`getDisplayMedia`, used here) | Any embed, any site | The viewer clicks "Share this tab" once per session. Chrome/Edge also crop the capture to the player (Region Capture), so the math is exact. Desktop only; mobile browsers don't support it. |
| **Direct video** (`<video crossorigin>`) | Local files, or video URLs whose host sends CORS headers | No prompt, but YouTube/Twitch never serve streams that way. |
| **Browser extension** (later) | twitch.tv and youtube.com themselves | A content script can't read the site's `<video>` either when it's DRM or cross-origin, but `chrome.tabCapture` gives the same frames as tab capture without the share dialog. This is the smoothest end state. |
| **Desktop/mobile app** (later) | Anything on screen | Screen recording permission; same core code in a webview. |

The zoom can only be as sharp as the stream: a card that is 60 px tall in a 1080p stream is upscaled and sharpened, not restored. That is why the lookup matters: once a card is named, you see the official high-res scan.

## How it works

Every 350 ms the page finds the cards in the frame (the trained detector below, or `core/detect.js` as a fallback), a tracker keeps them steady across frames, and each steady card is recognised by its picture against one index per game. A recognised card's official scan is drawn over it, turned to lie like the card (tapped, tilted, or upside down for the far player), and follows it as it moves. Every couple of seconds each card is compared with how it looked when recognised, and recognised again if it changed. Cards that match nothing (webcams, overlays, unknown cards) are not drawn.

During tab capture, drawing over the video needs Chrome 132+ (Element Capture), which leaves the page's own drawings out of the captured frames.

## Trained card detector

`core/cardnet.js` runs a small trained detector (`models/cards-obb.onnx`, YOLO11n-OBB, about 11 MB) with ONNX Runtime Web in a background worker. The runtime is bundled in `vendor/ort/` (WebAssembly build, MIT), with a CDN copy as fallback. It finds every card with its exact angle, including fanned hands, overlapping piles and upside-down cards, in any game, and the picture matcher then reads each card at that angle. If the model or runtime can't load, the page says so and falls back to the edge-based detector in `core/detect.js` (also forced with `?classic`).

The model is trained only on generated tables, so no hand-labelled footage is needed:
- `tools/detector/fetch-cards.mjs` (GitHub Action `fetch-training-cards.yml`) downloads about 4,500 card images from Scryfall, pokemontcg.io, YGOPRODeck and Lorcast into the `training-cards` branch.
- `tools/detector/synth.py CARDS OUT` composes broadcast-like frames from them: playmats with logos and bands, webcams, score bars and captions, rows of permanents (tapped, far side upside down), fanned clusters, piles, sleeves, glare, blur and heavy JPEG. Each card is labelled with its corners.
- `tools/detector/train.py OUT/data.yaml` fine-tunes Ultralytics YOLO11n-OBB on CPU and exports the ONNX file. The base model and its derivatives are AGPL-3.0.

Real broadcast screenshots used for checking live in the project's `benchmarks/` folder (Magic, Pokémon, Lorcana, Star Wars: Unlimited, Flesh and Blood).

## Card databases

Indexes are built from free public sources; the page loads card images straight from them:

| Game | Source | Images |
|---|---|---|
| Magic | Scryfall bulk data | cards.scryfall.io |
| Pokémon | PokemonTCG/pokemon-tcg-data (GitHub) | images.pokemontcg.io |
| Lorcana | Lorcast API | Lorcast |
| Yu-Gi-Oh! | YGOPRODeck API | images.ygoprodeck.com (asks apps not to hotlink heavily; cache before any real launch) |
| Star Wars: Unlimited | SWU-DB API | SWU-DB |
| Flesh and Blood | the-fab-cube/flesh-and-blood-cards (GitHub) | Legend Story Studios |

`core/lookup.js` (name search) and `core/ocr.js` (name reading) are kept for an extension or app but the page no longer uses them.

## Layout, built to port to an extension or app

```
index.html          page markup and styles
web/app.js          page-only wiring: embeds, capture, drawing cards, hover
core/zoom.js        stage <-> video pixel mapping
core/detect.js      edge-based card detection, and tracking
core/cardnet.js     trained card detector (ONNX Runtime Web, in a worker)
core/fingerprint.js picture fingerprints and matching
core/match.js       quick look signatures (spotting a card that changed)
core/lookup.js      card database search (unused by the page)
core/ocr.js         card name reading (unused by the page)
vendor/ort/         ONNX Runtime Web, bundled
```

`core/` has no page state and no DOM lookups; each file adds itself to `window.CardZoom` and works as a classic script, so an extension content script or an app webview can load the same files. For a Manifest V3 extension, bundle tesseract.js locally (`CardZoom.ocr.setTesseractUrl(...)`), since remote scripts aren't allowed.

## Picture recognition

Reading names fails on broadcast footage, so cards are recognised by their picture. There is one index per game in `data/` (`mtg`, `pokemon`, `lorcana`, `yugioh`, `swu`, `fab`). The page tries every game until one is clearly the stream's, then only that one. `.github/workflows/build-index.yml` runs `tools/build-index.mjs` weekly (and on demand): for each game it downloads every card image, fingerprints it with `core/fingerprint.js` (a perceptual hash of the art plus a colour layout), and commits `data/GAME.bin` and `data/GAME.json`. It then self-tests on degraded copies of real cards (32 to 120 px tall, blurred, recompressed, re-lit) and on non-card crops, picks the colour weight and distance cut-off, and writes the results to `data/GAME-selftest.md` and the run summary.

In the page, every steady detection is fingerprinted and matched against the index. Broadcast boxes are loose and cards are tilted, sleeved and often upside down (facing the other player), so each box is tried in many placements: upright and turned 180°, tilted up to 10°, a little smaller and shifted. A few coarse placements are searched across the whole index to shortlist candidates, the finer grid is scored against the shortlist only, and the winner is searched in full once more (about 0.1 s per card, spread over frames). A match must be close and clearly better than the next card; on loose matches a wide lead is required, which is what keeps webcams and notepads out. On a real SCG regional broadcast screenshot this took recognised table cards from 2 to 9 with no false matches. Cards that match nothing (webcams, overlays) are never shown.

## Learned matcher

Picture hashes break down on the hardest footage: cards 30–60 px tall, glare across the art, washed-out light, a card half under another. A small trained network handles those better. `tools/matcher/train_embed.py` takes card scans (one class per card) and trains a MobileNetV3 to map any broadcast-like view of a card close to its clean scan: sleeves, glare spots and washes, partial cover, tilt, a loose box, shrinking to 30–120 px, blur, colour casts and heavy JPEG are all simulated. The result is `models/card-embed.onnx` (96×128 RGB in, 128 numbers out, 17 MB; quantizing it to 8 bits cost too much accuracy). On held-out cards it never saw, degraded the same way, it names 91% correctly against 4,500 cards, where picture hashes name 49% (`tools/matcher/eval_hash.mjs` runs the hash side).

The index build stores each card's 128 numbers in `data/GAME.emb` and self-tests a similarity cut-off from non-card crops. In the page it runs alongside the picture hashes in the background worker, one card at a time (upright and turned round, at two sizes). Add `?hashonly` to the address to turn it off.

Two stream-level hints help both matchers. A card already named on this stream needs a smaller lead to be named again (decks repeat cards). For Magic, once five cards are named, the narrowest format they are all legal in (Standard to Vintage) becomes a preference, and every other try searches only cards legal there; tokens and helper cards don't vote and are never excluded. Each Magic index entry is one artwork in one frame style, so old borders, showcase and borderless copies are all there.

Generative upscaling was considered and not used: it invents plausible detail, which is exactly what an identity match must not trust. Training the matcher on degraded views gets the benefit without the made-up pixels.
