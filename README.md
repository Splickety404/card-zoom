# Card Zoom (prototype)

A web page that plays a Twitch or YouTube card game stream, spots the cards on screen automatically, shows a large cleaned-up view of the one you care about, and looks up its full-resolution image in public card databases.

Live: https://splickety404.github.io/card-zoom/

## Run it

`card-zoom.html` is the whole app in one file (built from the sources by `python3 tools/build.py`; rebuild after editing). Opened straight from disk it runs, and local video files work, but stream embeds won't play.

Embeds need a real web origin (YouTube refuses `file://`, Twitch needs a `parent=` domain), so serve the folder:

```
cd card-zoom
python3 -m http.server 8000
```

Open http://localhost:8000, paste a stream link, press **Load**, then **Start capture** and pick **this tab** in the browser's share dialog.

To try it without a stream: http://localhost:8000/?demo (a fake table), or **Open video file** and pick `samples/synthetic-table.webm`.

Keys: `A` auto spot on/off, `Z` pick a card by hand, `L` live zoom, `F` full screen, `Esc` close.

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

## How auto spotting works

`core/detect.js`, no ML model and no library. Every 350 ms it scales the frame to 800 px wide, finds edges, groups them into blobs, and keeps blobs whose box has a trading card's shape (63×88, upright or tapped sideways) with strong edges on all four sides. A tracker keeps boxes steady across frames. The zoom follows the biggest card (usually one held up to the camera or shown in a card overlay) until you click a different one in the "On screen" strip, which pins it. Tapped cards are turned upright automatically.

**Identify automatically**: once the focused card has been steady for about 1.5 seconds (or when you click it), the page reads the name band at the top of the card with Tesseract.js (loaded from a CDN on first use), searches every database, then compares each result's scan with the stream crop (`core/match.js`) to pick the right card and printing. The zoom then shows the official high-res scan; **Stream** switches back to the enlarged crop. A weak picture match is shown as a "best guess" and the zoom stays on the stream view. Clicking any search result makes it the card's image.

Small cards: detection works down to about 3% of the video height. Their names are usually too small to read, so a tiny card can be spotted but not always identified; picking it with a name search, or clicking a result, still gets the crisp scan. Identifying by picture alone (no name) would need a prebuilt image index of every card, which is the natural next step.

Webcam boxes and people can be card-shaped, so larger candidates must also show straight rules across their face (name bar, art box, text box) to count. If something still gets picked up, hover its box and press × (or **Not a card** in the zoom panel) and that area is ignored for the rest of the video.

**Overlay**: every identified card is drawn on top of the video at its position and follows it as it moves; tapped cards are turned to match. Every couple of seconds each card is compared with how it looked when identified, and re-identified if it changed. During tab capture this needs Chrome 132+ (Element Capture), which leaves the page's own overlays out of the captured frames; on older browsers overlays are off and cards show in the side panel only. `O` toggles overlays.

Known limits, honestly stated:
- Tested only on synthetic tables (the demo and the sample video), because this build environment can't reach YouTube, Twitch or the card APIs. Real streams with overlays, glare or sleeves will need tuning.
- Cards that touch or overlap can merge into one box, or be missed.
- Card-shaped stream overlays (some streamers' card popups) will be spotted too; that is often what you want.
- OCR on stream-quality text is hit and miss. Scryfall's fuzzy match forgives small typos; the others less so.

## Trained card detector

`core/cardnet.js` runs a small trained detector (`models/cards-obb.onnx`, YOLO11n-OBB, about 11 MB) with ONNX Runtime Web in a background worker, loaded from a CDN on first use. It finds every card with its exact angle, including fanned hands, overlapping piles and upside-down cards, in any game, and the picture matcher then reads each card at that angle. If the model or runtime can't load, the page falls back to the edge-based detector in `core/detect.js` (also forced with `?classic`).

The model is trained only on generated tables, so no hand-labelled footage is needed:
- `tools/detector/fetch-cards.mjs` (GitHub Action `fetch-training-cards.yml`) downloads about 4,500 card images from Scryfall, pokemontcg.io, YGOPRODeck and Lorcast into the `training-cards` branch.
- `tools/detector/synth.py CARDS OUT` composes broadcast-like frames from them: playmats with logos and bands, webcams, score bars and captions, rows of permanents (tapped, far side upside down), fanned clusters, piles, sleeves, glare, blur and heavy JPEG. Each card is labelled with its corners.
- `tools/detector/train.py OUT/data.yaml` fine-tunes Ultralytics YOLO11n-OBB on CPU and exports the ONNX file. The base model and its derivatives are AGPL-3.0.

Real broadcast screenshots used for checking live in the project's `benchmarks/` folder (Magic, Pokémon, Lorcana, Star Wars: Unlimited, Flesh and Blood).

## Card databases

All free, no key, CORS enabled, called straight from the browser (`core/lookup.js`):

- Magic: Scryfall
- Pokémon: pokemontcg.io
- Yu-Gi-Oh!: YGOPRODeck (asks that apps don't hotlink images heavily; cache them before any real launch)
- Lorcana: Lorcast

Other games get a TCGplayer search link. Adding a game is one entry in `GAMES`.

## Layout, built to port to an extension or app

```
index.html        page markup and styles
web/app.js        page-only wiring: embeds, capture, buttons, panels
core/zoom.js      selection <-> video pixel mapping, crop, upscale, sharpen, rotate
core/detect.js    card detection and tracking
core/lookup.js    card database search
core/ocr.js       card name reading
```

`core/` has no page state and no DOM lookups; each file adds itself to `window.CardZoom` and works as a classic script, so an extension content script or an app webview can load the same files. For a Manifest V3 extension, bundle tesseract.js locally (`CardZoom.ocr.setTesseractUrl(...)`), since remote scripts aren't allowed.

## Picture recognition (Magic, Pokémon, Lorcana)

Reading names fails on broadcast footage, so cards are recognised by their picture. There is one index per game (`data/mtg`, `data/pokemon`, `data/lorcana`, from Scryfall, pokemontcg.io and Lorcast). The page tries every game until one is clearly the stream's, then only that one. `.github/workflows/build-index.yml` runs `tools/build-index.mjs` weekly (and on demand): it downloads every unique Magic artwork from Scryfall, fingerprints each image with `core/fingerprint.js` (a perceptual hash of the art plus a colour layout), and commits `data/mtg.bin` and `data/mtg.json`. It then self-tests on degraded copies of real cards (32 to 120 px tall, blurred, recompressed, re-lit) and on non-card crops, picks the colour weight and distance cut-off, and writes the results to `data/mtg-selftest.md` and the run summary.

In the page, every steady detection is fingerprinted and matched against the index. Broadcast boxes are loose and cards are tilted, sleeved and often upside down (facing the other player), so each box is tried in many placements: upright and turned 180°, tilted up to 10°, a little smaller and shifted. A few coarse placements are searched across the whole index to shortlist candidates, the finer grid is scored against the shortlist only, and the winner is searched in full once more (about 0.1 s per card, spread over frames). A match must be close and clearly better than the next card; on loose matches a wide lead is required, which is what keeps webcams and notepads out. On a real SCG regional broadcast screenshot this took recognised table cards from 2 to 9 with no false matches. Cards that match nothing (webcams, overlays) are never shown. Name reading is now only a fallback for large cards.
