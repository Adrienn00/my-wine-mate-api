require("dotenv").config();

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

async function enrichWineWithAI({ name, winery, year, region, type }, userApiKey = null) {
  const apiKey = (userApiKey || "").trim();
  if (!apiKey) {
    throw new Error("Groq API key required. Add your key in Profile → API Settings.");
  }

  const parts = [name, winery, year].filter(Boolean).join(", ");
  const prompt = `You are a master sommelier with deep knowledge of wines worldwide. Your task is to fill in complete wine details.

Wine: ${parts}
${region ? `Region: ${region}` : ""}
${type ? `Type hint: ${type}` : ""}

IMPORTANT RULES:
- NEVER write phrases like "limited information", "I don't know", "unknown", or "not well-documented" in any field.
- If you don't know the exact wine, infer plausible details from the name, winery, region, type, and grape varieties typical for that origin.
- Every field must contain realistic, specific content — no vague placeholders.
- description: Write a vivid, expert 2-3 sentence description about the wine's style and character, inferred from its type and origin if needed.
- flavorProfiles: List 3-5 typical flavor notes for this wine style and region.
- foodPairingHints: List 2-4 specific food pairing suggestions.
- tags: List 2-4 descriptive tags.

Return a JSON object with exactly these fields:
{
  "name": "full wine name",
  "winery": "producer name",
  "description": "2-3 sentence expert description",
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
  "tags": ["bold", "terroir-driven"]
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
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a master sommelier with encyclopedic wine knowledge. Always respond with valid JSON only. Never admit ignorance — infer plausible expert details from context when you lack specific knowledge.",
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
