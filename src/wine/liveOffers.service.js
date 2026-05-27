function parsePriceToNumber(rawPrice) {
  if (rawPrice === null || rawPrice === undefined) return null;
  const text = String(rawPrice).replace(/\s/g, '').replace(',', '.');
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapSerpApiOffer(item = {}) {
  const price = parsePriceToNumber(item.price);
  return {
    shopName: item.source || item.seller || 'Unknown shop',
    title: item.title || '',
    price,
    currency: item.currency || 'RON',
    url: item.link || item.product_link || '',
    imageUrl: item.thumbnail || item.image || '',
  };
}

function buildFallbackOffers(wineName = '', winery = '') {
  const query = encodeURIComponent([wineName, winery].filter(Boolean).join(' ').trim());
  if (!query) return [];

  return [
    {
      shopName: 'Arukereso',
      title: 'Search',
      price: null,
      currency: 'RON',
      url: `https://www.arukereso.hu/?st=${query}`,
      imageUrl: '',
    },
    {
      shopName: 'Google Shopping',
      title: 'Search',
      price: null,
      currency: 'RON',
      url: `https://www.google.com/search?tbm=shop&q=${query}`,
      imageUrl: '',
    },
    {
      shopName: 'Wine-Searcher',
      title: 'Search',
      price: null,
      currency: 'EUR',
      url: `https://www.wine-searcher.com/find/${query}`,
      imageUrl: '',
    },
    {
      shopName: 'Vivino',
      title: 'Search',
      price: null,
      currency: 'RON',
      url: `https://www.vivino.com/search/wines?q=${query}`,
      imageUrl: '',
    },
  ];
}

async function fetchLiveOffers({ wineName, winery }) {
  const serpApiKey = process.env.SERPAPI_KEY;
  if (!serpApiKey) {
    return { offers: buildFallbackOffers(wineName, winery), source: 'fallback', stale: true };
  }

  const query = [wineName, winery].filter(Boolean).join(' ').trim();
  if (!query) return { offers: [], source: 'serpapi', stale: false };

  const params = new URLSearchParams({
    engine: 'google_shopping',
    q: query,
    gl: 'ro',
    hl: 'hu',
    api_key: serpApiKey,
  });

  try {
    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`SerpAPI error ${response.status}`);
    }

    const payload = await response.json();
    const shoppingResults = Array.isArray(payload.shopping_results) ? payload.shopping_results : [];
    const offers = shoppingResults
      .map(mapSerpApiOffer)
      .filter((offer) => offer.url)
      .slice(0, 12);

    if (!offers.length) {
      return { offers: buildFallbackOffers(wineName, winery), source: 'fallback', stale: true };
    }

    return { offers, source: 'serpapi', stale: false };
  } catch {
    return { offers: buildFallbackOffers(wineName, winery), source: 'fallback', stale: true };
  }
}

module.exports = {
  fetchLiveOffers,
};
