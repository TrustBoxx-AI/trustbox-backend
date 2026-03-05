/**
 * TrustBox — Chainlink Functions: parseIntent.js
 * ─────────────────────────────────────────────────
 * Runs on the Chainlink DON (Decentralised Oracle Network).
 * Calls Groq API (Llama 3.1) to parse natural language intent
 * into a structured JSON spec.
 *
 * Args:
 *   args[0] = encodeURIComponent(nlText)
 *   args[1] = category ("Travel Booking" | "Portfolio Rebalance" | "Contributor Tip")
 *
 * Secrets (DON-hosted, encrypted):
 *   secrets.GROQ_API_KEY
 *
 * Returns: UTF-8 bytes of JSON spec string
 */

const nlText   = decodeURIComponent(args[0])
const category = args[1]

// ── System prompt per category ────────────────────────────────
const SYSTEM_PROMPTS = {
  "Travel Booking": `You are a travel booking intent parser. Convert natural language into structured JSON.
Always return ONLY valid JSON with these exact fields:
{
  "action": "book_travel",
  "entity": "<destination city>",
  "params": {
    "origin": "<departure city or null>",
    "destination": "<destination city>",
    "departureDate": "<YYYY-MM-DD or null>",
    "returnDate": "<YYYY-MM-DD or null>",
    "passengers": <number>,
    "class": "<economy|business|first>",
    "budget": "<amount + currency or null>",
    "preferences": []
  }
}`,

  "Portfolio Rebalance": `You are a DeFi portfolio intent parser. Convert natural language into structured JSON.
Always return ONLY valid JSON with these exact fields:
{
  "action": "defi_swap",
  "entity": "<token pair e.g. ETH/USDC>",
  "params": {
    "fromToken": "<token symbol>",
    "toToken": "<token symbol>",
    "amount": "<amount or percentage>",
    "slippage": <number between 0.1 and 5>,
    "deadline": <unix timestamp or null>,
    "protocol": "<uniswap|paraswap|1inch|auto>",
    "chain": "avalanche"
  }
}`,

  "Contributor Tip": `You are a contributor tip intent parser. Convert natural language into structured JSON.
Always return ONLY valid JSON with these exact fields:
{
  "action": "agent_task",
  "entity": "<contributor or project name>",
  "params": {
    "recipient": "<address or ENS or name>",
    "amount": "<amount>",
    "token": "<AVAX|USDC|LINK>",
    "message": "<optional tip message or null>",
    "chain": "avalanche"
  }
}`
}

const systemPrompt = SYSTEM_PROMPTS[category] ?? SYSTEM_PROMPTS["Travel Booking"]

// ── Call Groq API ─────────────────────────────────────────────
const groqResponse = await Functions.makeHttpRequest({
  url:     "https://api.groq.com/openai/v1/chat/completions",
  method:  "POST",
  headers: {
    "Authorization": `Bearer ${secrets.GROQ_API_KEY}`,
    "Content-Type":  "application/json",
  },
  data: {
    model:       "llama-3.1-8b-instant",
    temperature: 0.1,   // Low temp for deterministic structured output
    max_tokens:  512,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: `Parse this intent: "${nlText}"` },
    ],
  },
  timeout: 9000,  // Chainlink Functions has 10s limit
})

if (groqResponse.error) {
  throw new Error(`Groq API error: ${groqResponse.error}`)
}

const content = groqResponse.data?.choices?.[0]?.message?.content
if (!content) {
  throw new Error("Empty response from Groq API")
}

// ── Validate and clean JSON ───────────────────────────────────
let specJson
try {
  // Strip markdown code fences if present
  const cleaned = content
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim()

  const parsed = JSON.parse(cleaned)

  // Validate required fields
  if (!parsed.action || !parsed.entity || !parsed.params) {
    throw new Error("Missing required fields: action, entity, params")
  }

  specJson = JSON.stringify(parsed)
} catch (e) {
  throw new Error(`Invalid JSON from model: ${e.message}\nRaw: ${content.slice(0, 200)}`)
}

// ── Return as UTF-8 bytes ─────────────────────────────────────
return Functions.encodeString(specJson)