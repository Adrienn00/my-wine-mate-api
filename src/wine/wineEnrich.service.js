require("dotenv").config();

const GEMINI_MODEL = "gemini-2.0-flash";

async function enrichWineWithAI({ name, winery, year, region, type }) {
  const apiKey = String(process.env.GOOGLE_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not configured.");
  }

  const prompt = `You are a wine expert. Search the web for information about this wine and return a detailed JSON object.

Wine: ${[name, winery, year].filter(Boolean).join(", ")}
${region ? `Region: ${region}` : ""}
${type ? `Type hint: ${type}` : ""}

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

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini enrich error ${response.status}: ${err}`);
  }

  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/({[\s\S]*})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;

  try {
    return JSON.parse(jsonStr.trim());
  } catch {
    throw new Error("Could not parse Gemini response as JSON.");
  }
}

module.exports = { enrichWineWithAI };
