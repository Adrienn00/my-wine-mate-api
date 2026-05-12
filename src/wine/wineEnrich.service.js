require("dotenv").config();

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

async function searchWineOnWeb(wineName, winery, year) {
  const serpApiKey = process.env.SERPAPI_KEY;
  if (!serpApiKey) return [];

  const query = [wineName, winery, year].filter(Boolean).join(" ").trim();
  const params = new URLSearchParams({
    engine: "google",
    q: `${query} wine description tasting notes`,
    num: "5",
    api_key: serpApiKey,
  });

  try {
    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    if (!response.ok) return [];
    const payload = await response.json();
    const results = Array.isArray(payload.organic_results) ? payload.organic_results : [];
    return results.slice(0, 5).map((r) => ({
      title: r.title || "",
      snippet: r.snippet || "",
    }));
  } catch {
    return [];
  }
}

async function enrichWineWithAI({ name, winery, year, region, type }) {
  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const webResults = await searchWineOnWeb(name, winery, year);
  const webContext = webResults.length
    ? webResults.map((r) => `${r.title}: ${r.snippet}`).join("\n")
    : "No web results available.";

  const prompt = `You are a wine expert. Based on the wine information and web search results below,
fill in all details about this wine and return a structured JSON object.

Wine: ${[name, winery, year].filter(Boolean).join(", ")}
${region ? `Region: ${region}` : ""}
${type ? `Type hint: ${type}` : ""}

Web search results:
${webContext}

Return a JSON object with exactly these fields (use null for unknown fields):
{
  "name": "full wine name",
  "winery": "producer name",
  "description": "2-3 sentence description of this wine",
  "type": "Red | White | Rosé | Sparkling | Dessert | Fortified",
  "style": "e.g. Full-bodied, Light-bodied, Crisp, Smooth",
  "flavorProfiles": ["Cherry", "Vanilla", "Oak"],
  "origin": {
    "country": "country",
    "region": "region or appellation"
  },
  "grapeVarieties": ["Cabernet Sauvignon"],
  "year": 2019,
  "alcohol": 13.5,
  "priceRange": "€10-20 | €20-40 | €40-80 | €80+",
  "foodPairingHints": ["Grilled lamb", "Hard cheese"],
  "tags": ["organic", "bold", "terroir-driven"]
}
Only return the JSON, no explanation.`;

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq enrich error ${response.status}: ${err}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content || "{}";

  try {
    return JSON.parse(content);
  } catch {
    throw new Error("Could not parse AI response as JSON.");
  }
}

module.exports = { enrichWineWithAI };
