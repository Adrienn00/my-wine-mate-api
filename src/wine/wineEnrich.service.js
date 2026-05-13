require("dotenv").config();

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

async function enrichWineWithAI({ name, winery, year, region, type }) {
  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const prompt = `You are a wine expert with extensive knowledge of wines worldwide. Provide detailed information about this wine based on your knowledge.

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

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a wine expert. Always respond with valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq enrich error ${response.status}: ${err}`);
  }

  const payload = await response.json();
  const text = payload.choices?.[0]?.message?.content || "{}";

  try {
    return JSON.parse(text.trim());
  } catch {
    throw new Error("Could not parse Groq response as JSON.");
  }
}

module.exports = { enrichWineWithAI };
