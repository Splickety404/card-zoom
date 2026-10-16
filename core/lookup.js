// Card Zoom core: card search across free public TCG databases. No DOM use.
// All four APIs need no key and send CORS headers, so a page or extension can call them directly.
// Exposes window.CardZoom.lookup. Add a game by adding an entry to GAMES.
(function (root) {
  'use strict';

  const GAMES = {
    mtg: {
      label: 'Magic',
      async search(q) {
        let r = await fetch(`https://api.scryfall.com/cards/search?unique=cards&order=edhrec&q=${encodeURIComponent(q)}`);
        let list = r.ok ? (await r.json()).data : [];
        if (!list.length) { // fuzzy match handles OCR typos like "Lightnlng Bolt"
          r = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(q)}`);
          if (r.ok) list = [await r.json()];
        }
        return list.map((c) => {
          const iu = c.image_uris || c.card_faces?.[0]?.image_uris || {};
          return { name: c.name, set: c.set_name, img: iu.normal || iu.large, big: iu.png || iu.large, link: c.scryfall_uri };
        });
      },
    },
    ptcg: {
      label: 'Pokémon',
      async search(q) {
        const clean = q.replace(/["\\]/g, '').trim();
        const query = /\s/.test(clean) ? `name:"${clean}"` : `name:${clean}*`;
        const r = await fetch(`https://api.pokemontcg.io/v2/cards?pageSize=24&orderBy=-set.releaseDate&q=${encodeURIComponent(query)}`);
        if (!r.ok) return [];
        return (await r.json()).data.map((c) => ({ name: c.name, set: c.set?.name, img: c.images.small, big: c.images.large, link: c.tcgplayer?.url }));
      },
    },
    ygo: {
      label: 'Yu-Gi-Oh!',
      async search(q) {
        const r = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?num=24&offset=0&fname=${encodeURIComponent(q)}`);
        if (!r.ok) return [];
        return (await r.json()).data.map((c) => ({ name: c.name, set: c.card_sets?.[0]?.set_name, img: c.card_images[0].image_url_small, big: c.card_images[0].image_url, link: c.ygoprodeck_url }));
      },
    },
    lorcana: {
      label: 'Lorcana',
      async search(q) {
        const r = await fetch(`https://api.lorcast.com/v0/cards/search?q=${encodeURIComponent(q)}`);
        if (!r.ok) return [];
        return ((await r.json()).results || []).slice(0, 24).map((c) => {
          const d = c.image_uris?.digital || {};
          return { name: c.version ? `${c.name} - ${c.version}` : c.name, set: c.set?.name, img: d.normal || d.small, big: d.large || d.normal };
        });
      },
    },
  };

  // Searches the given games in parallel. Results are interleaved so a multi-game search
  // shows the best hit from each game first. Returns {results, failed: [gameKey]}.
  async function searchCards(q, gameKeys = Object.keys(GAMES), limit = 30) {
    q = q.trim();
    if (!q) return { results: [], failed: [] };
    const settled = await Promise.allSettled(gameKeys.map((k) => GAMES[k].search(q).then((l) => l.map((c) => ({ ...c, game: k })))));
    const failed = gameKeys.filter((k, i) => settled[i].status === 'rejected');
    const lists = settled.map((s) => (s.status === 'fulfilled' ? s.value.filter((c) => c.img) : []));
    const results = [];
    for (let i = 0; results.length < limit && lists.some((l) => l[i]); i++) lists.forEach((l) => l[i] && results.push(l[i]));
    return { results: results.slice(0, limit), failed };
  }

  // Fallback for games without a database here.
  const otherGamesUrl = (q) => `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(q)}`;

  root.CardZoom = root.CardZoom || {};
  root.CardZoom.lookup = { GAMES, searchCards, otherGamesUrl };
})(typeof window !== 'undefined' ? window : self);
