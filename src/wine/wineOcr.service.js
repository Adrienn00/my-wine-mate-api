require("dotenv").config();

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

async function extractWineLabelFromImage(base64Image, mimeType = "image/jpeg", userApiKey = null) {
  const apiKey = (userApiKey || "").trim();
  if (!apiKey) {
    throw new Error("Groq API key required. Add your key in Profile → API Settings.");
  }

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64Image}` },
            },
            {
              type: "text",
              text: `You are a wine label reader. Extract information from this wine bottle label image.
Return a JSON object with exactly these fields (use null for fields you cannot determine):
{
  "name": "wine product name",
  "winery": "producer or winery name",
  "year": 2019,
  "type": "Red | White | Rosé | Sparkling | Dessert | Fortified",
  "region": "region or appellation",
  "country": "country of origin",
  "grapeVarieties": ["Merlot"],
  "alcohol": 13.5,
  "rawText": "all text visible on label"
}
Only return the JSON, no explanation.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq vision error ${response.status}: ${err}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content || "{}";

  try {
    return JSON.parse(content);
  } catch {
    return { rawText: content };
  }
}

module.exports = { extractWineLabelFromImage };
