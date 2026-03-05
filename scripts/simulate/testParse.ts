/* scripts/simulate/testParse.ts — TrustBox
   Tests the Chainlink Functions parseIntent.js locally.
   ─────────────────────────────────────────────────────── */

import * as fs   from "fs"
import * as path from "path"

const SOURCE_PATH = path.resolve(__dirname, "../../functions/source/parseIntent.js")

// ── Mock Functions runtime ────────────────────────────────────
const Functions = {
  makeHttpRequest: async (params: {
    url:     string
    method:  string
    headers: Record<string, string>
    data:    object
    timeout: number
  }) => {
    const res = await fetch(params.url, {
      method:  params.method,
      headers: params.headers,
      body:    JSON.stringify(params.data),
    })

    if (!res.ok) {
      return { error: `HTTP ${res.status}: ${res.statusText}`, data: null }
    }

    const data = await res.json()
    return { error: null, data }
  },

  encodeString: (s: string): Uint8Array => {
    return new TextEncoder().encode(s)
  },
}

// ── Mock secrets ──────────────────────────────────────────────
const secrets = {
  GROQ_API_KEY: process.env.GROQ_API_KEY ?? "",
}

// ── Test cases ────────────────────────────────────────────────
const TEST_CASES = [
  {
    nlText:   "Book me a flight from Lagos to London next Friday, business class",
    category: "Travel Booking",
  },
  {
    nlText:   "Swap 0.5 ETH to USDC with 1% slippage",
    category: "Portfolio Rebalance",
  },
  {
    nlText:   "Send 10 AVAX tip to vitalik.eth",
    category: "Contributor Tip",
  },
]

async function runTest(nlText: string, category: string) {
  console.log(`\n─────────────────────────────────────────`)
  console.log(`Input:    "${nlText}"`)
  console.log(`Category: ${category}`)

  const source = fs.readFileSync(SOURCE_PATH, "utf-8")
  const args   = [encodeURIComponent(nlText), category]

  // Execute source in sandbox
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor
  const fn = new AsyncFunction("Functions", "secrets", "args", source)

  try {
    const result = await fn(Functions, secrets, args)

    // ✅ Safe access — result may be Uint8Array or Buffer
    const bytes = result as Uint8Array | undefined
    if (!bytes || bytes.length === 0) {
      console.log("Result: (empty)")
      return
    }

    const decoded = new TextDecoder().decode(bytes)
    const parsed  = JSON.parse(decoded)
    console.log("✅ Result:", JSON.stringify(parsed, null, 2))
  } catch (err: any) {
    console.error("❌ Error:", err.message)
  }
}

async function main() {
  if (!process.env.GROQ_API_KEY) {
    console.error("❌ GROQ_API_KEY not set in .env")
    process.exit(1)
  }

  console.log("TrustBox — Chainlink Functions Local Test")
  console.log("═══════════════════════════════════════════")

  for (const tc of TEST_CASES) {
    await runTest(tc.nlText, tc.category)
  }

  console.log("\n═══════════════════════════════════════════")
  console.log("Done!")
}

main().catch(console.error)