function parsePriceToNumber(rawPrice) {
  if (rawPrice === null || rawPrice === undefined) return null;
  const text = String(rawPrice).replace(/\s/g, '').replace(',', '.');
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapSerpApiOffer(item = {}) {
  const extractedPrice = Number(item.extracted_price);
  const price =
    Number.isFinite(extractedPrice)
      ? extractedPrice
      : parsePriceToNumber(item.price || item.price_from || item.price_to || item.snippet);
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
      currency: 'RON',
      url: `https://www.arukereso.hu/?st=${query}`,
      imageUrl: '',
      note: 'Quick price comparison',
    },
    {
      shopName: 'Google Shopping',
      title: 'Search',
      currency: 'RON',
      url: `https://www.google.com/search?tbm=shop&q=${query}`,
      imageUrl: '',
      note: 'Online store results',
    },
    {
      shopName: 'Wine-Searcher',
      title: 'Search',
      currency: 'EUR',
      url: `https://www.wine-searcher.com/find/${query}`,
      imageUrl: '',
      note: 'International offers',
    },
    {
      shopName: 'Vivino',
      title: 'Search',
      currency: 'RON',
      url: `https://www.vivino.com/search/wines?q=${query}`,
      imageUrl: '',
      note: 'Ratings and shops',
    },
  ];
}

function getSerpApiKey() {
  return process.env.SERPAPI_KEY || process.env.SERP_API_KEY || '';
}

function extractShoppingResults(payload = {}) {
  const primary = Array.isArray(payload.shopping_results) ? payload.shopping_results : [];
  const inline = Array.isArray(payload.inline_shopping_results) ? payload.inline_shopping_results : [];
  const inlineResults = Array.isArray(payload.inline_results) ? payload.inline_results : [];
  return [...primary, ...inline, ...inlineResults];
}

function dedupeOffers(offers = []) {
  const seen = new Set();
  return offers.filter((offer) => {
    const key = `${offer.shopName}::${offer.url}`;
    if (!offer.url || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchSerpApiOffers(query, serpApiKey) {
  const parameterSets = [
    {
      engine: 'google_shopping',
      q: query,
      google_domain: 'google.ro',
      gl: 'ro',
      hl: 'ro',
      api_key: serpApiKey,
    },
    {
      engine: 'google_shopping',
      q: query,
      google_domain: 'google.com',
      gl: 'ro',
      hl: 'en',
      api_key: serpApiKey,
    },
    {
      engine: 'google',
      q: query,
      google_domain: 'google.ro',
      gl: 'ro',
      hl: 'ro',
      tbm: 'shop',
      api_key: serpApiKey,
    },
  ];

  for (const currentParams of parameterSets) {
    const params = new URLSearchParams(currentParams);
    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`SerpAPI error ${response.status}`);
    }

    const payload = await response.json();
    const offers = dedupeOffers(
      extractShoppingResults(payload)
      .map(mapSerpApiOffer)
      .filter((offer) => offer.url)
    ).slice(0, 12);

    if (offers.length) {
      return offers;
    }
  }

  return [];
}

async function fetchLiveOffers({ wineName, winery, year = null }) {
  const serpApiKey = getSerpApiKey();
  if (!serpApiKey) {
    return { offers: buildFallbackOffers(wineName, winery), source: 'fallback', stale: true };
  }

  const normalizedYear = Number.isFinite(Number(year)) ? String(year).trim() : '';
  const query = [wineName, normalizedYear, winery].filter(Boolean).join(' ').trim();
  if (!query) return { offers: [], source: 'serpapi', stale: false };

  try {
    const searchQueries = [
      query,
      [wineName, normalizedYear].filter(Boolean).join(' ').trim(),
      wineName ? String(wineName).trim() : '',
    ].filter(Boolean);

    for (const currentQuery of searchQueries) {
      const offers = await fetchSerpApiOffers(currentQuery, serpApiKey);
      if (offers.length) {
        return { offers, source: 'serpapi', stale: false };
      }
    }
  } catch (error) {
    console.warn('Live offers SerpAPI request failed:', error.message);
    return { offers: buildFallbackOffers(wineName, winery), source: 'fallback', stale: true };
  }

  return { offers: buildFallbackOffers(wineName, winery), source: 'fallback', stale: true };
}

module.exports = {
  fetchLiveOffers,
};
