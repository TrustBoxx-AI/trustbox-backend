// parseIntent.js — Chainlink Functions Source
// Runs on the Chainlink DON (Decentralised Oracle Network)
// Calls Groq API with Llama 3.1 to parse NL intent → structured JSON spec
//
// args[0] = URL-encoded NL intent text
// args[1] = intent category
// secrets.GROQ_API_KEY = encrypted Groq API key (uploaded via encryptSecrets.ts)

const nlText   = decodeURIComponent(args[0]);
const category = args[1];

const systemPrompt = [
  "You are a structured intent parser for a blockchain execution engine called TrustBox.",
  "Parse the user's natural language intent into a JSON object.",
  "Rules:",
  "- Return ONLY valid JSON — no explanation, no markdown, no backticks",
  "- action: snake_case verb describing the task (e.g. book_travel, rebalance_portfolio, tip_contributors)",
  "- confidence: 0.0 to 1.0 based on how clear and unambiguous the intent is",
  "- params: key-value object with all extracted parameters (dates, amounts, addresses, etc.)",
  "- verification: what data source verifies correctness (e.g. 'Chainlink Price Feed: AVAX/USD')",
  "- execution: what system executes this (e.g. 'IntentVault.sol → Booking API')",
  "- estimatedCost: human-readable cost estimate including gas",
  `- category must match: ${category}`,
  "",
  "Required JSON shape:",
  '{"action":"","confidence":0.0,"params":{},"verification":"","execution":"","estimatedCost":""}',
].join("\n");

const response = await Functions.makeHttpRequest({
  url:    "https://api.groq.com/openai/v1/chat/completions",
  method: "POST",
  headers: {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${secrets.GROQ_API_KEY}`,
  },
  data: {
    model:       "llama-3.1-8b-instant",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: `Parse this intent: ${nlText}` },
    ],
    temperature: 0.1,   // low = deterministic JSON for consistent hashing
    max_tokens:  512,
  },
  timeout: 8000,
});

if (response.error) {
  throw new Error(`Groq API error: ${JSON.stringify(response.error)}`);
}

const rawContent = response.data?.choices?.[0]?.message?.content;
if (!rawContent) {
  throw new Error("Groq API returned empty content");
}

// Validate JSON structure before encoding
let parsed;
try {
  parsed = JSON.parse(rawContent);
} catch (e) {
  throw new Error(`Groq returned invalid JSON: ${rawContent.slice(0, 200)}`);
}

// Validate required fields
if (!parsed.action)     throw new Error("Missing required field: action");
if (!parsed.params)     throw new Error("Missing required field: params");
if (parsed.confidence == null) throw new Error("Missing required field: confidence");

// Encode and return — DON delivers this to fulfillRequest()
return Functions.encodeString(JSON.stringify(parsed));
