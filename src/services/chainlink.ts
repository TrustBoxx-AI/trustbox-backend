

import { ethers } from "ethers"
import { env }    from "../config/env"

export const provider = new ethers.JsonRpcProvider(env.AVALANCHE_FUJI_RPC)
export const signer   = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider) as any

// ── Groq API helper ───────────────────────────────────────────
async function callGroq(prompt: string): Promise<string> {
  const apiKey = env.GROQ_API_KEY
  if (!apiKey) {
    // Graceful fallback — return a deterministic demo spec so the UI still works
    console.warn("[chainlink] GROQ_API_KEY not set — returning demo spec")
    const demo = {
      action: "generic",
      entity: "demo-target",
      params: { note: "Set GROQ_API_KEY on Render to enable real NL parsing", rawPrompt: prompt.slice(0, 80) }
    }
    return JSON.stringify(demo)
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:       "llama-3.1-70b-versatile",
      temperature: 0,
      max_tokens:  512,
      messages: [
        {
          role:    "system",
          content: [
            "You are a structured intent parser for a Web3 agent platform.",
            "Parse the user's natural language instruction into a JSON spec.",
            "Return ONLY valid JSON — no markdown, no explanation, no backticks.",
            "Schema: { \"action\": string, \"entity\": string, \"params\": object }",
            "action must be one of: book_travel | defi_swap | contributor_tip | portfolio_rebalance | generic",
            "entity is the target (hotel name, token symbol, contributor handle, etc.)",
            "params contains all relevant numeric / string details extracted from the instruction.",
          ].join(" "),
        },
        { role: "user", content: prompt },
      ],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    // On auth errors fall back to demo spec rather than crashing the endpoint
    if (res.status === 401 || res.status === 403) {
      console.warn(`[chainlink] Groq auth error ${res.status} — returning demo spec. Check GROQ_API_KEY on Render.`)
      const demo = {
        action: "book_travel",
        entity: "hotel",
        params: { note: "Groq API key invalid — update GROQ_API_KEY on Render", rawPrompt: prompt.slice(0, 80) }
      }
      return JSON.stringify(demo)
    }
    throw new Error(`Groq API error ${res.status}: ${errText}`)
  }

  const data = await res.json() as any
  const text  = data.choices?.[0]?.message?.content ?? ""

  // Strip any accidental markdown fences
  return text.replace(/```json|```/gi, "").trim()
}

// ── parseIntent — returns { specJson, specHash, requestId } ──
// Signature unchanged from the Chainlink Functions version so
// execute.ts works without modification.
export async function parseIntent(nlText: string, category: string): Promise<{
  specJson:  string
  specHash:  string
  requestId: string
}> {
  const prompt   = `Category: ${category}\nInstruction: ${nlText}`
  let   specJson = await callGroq(prompt)

  // Validate JSON — fall back to safe default if Groq returns garbage
  try {
    JSON.parse(specJson)
  } catch {
    console.warn("[chainlink] Groq returned non-JSON, using fallback spec")
    specJson = JSON.stringify({
      action: "generic",
      entity: nlText.slice(0, 40),
      params: { rawInstruction: nlText, category },
    })
  }

  const specHash  = ethers.id(specJson)
  const requestId = `groq-${Date.now()}` // synthetic request ID — no on-chain tx needed

  return { specJson, specHash, requestId }
}

// Keep old export name for any other callers
export const parseIntentViaChainlink = parseIntent
