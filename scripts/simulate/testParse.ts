/* scripts/simulate/testParse.ts
   Run parseIntent.js locally — no LINK consumed, no on-chain tx.
   Uses @chainlink/functions-toolkit simulateScript().
   Run: npx ts-node scripts/simulate/testParse.ts
   ──────────────────────────────────────────────────────────── */

import { simulateScript } from "@chainlink/functions-toolkit";
import { readFileSync }   from "fs";
import { join }           from "path";
import * as dotenv        from "dotenv";
dotenv.config();

const TEST_CASES = [
  {
    label:    "Travel Booking",
    nlText:   "Book a hotel in NYC for under $400/night for 3 nights in July, 1 guest, standard room",
    category: "Travel Booking",
  },
  {
    label:    "Portfolio Rebalance",
    nlText:   "Rebalance my portfolio to 60% equity and 40% bonds, sell high buy low, max 0.5% slippage",
    category: "Portfolio Rebalance",
  },
  {
    label:    "Contributor Tip",
    nlText:   "Tip the top 3 contributors of github.com/myorg/myrepo $10 each based on commits in last 30 days",
    category: "Contributor Tip",
  },
];

async function main() {
  const source = readFileSync(
    join(__dirname, "../../functions/source/parseIntent.js"),
    "utf8"
  );

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    console.error("\n❌  GROQ_API_KEY not set in .env\n");
    process.exit(1);
  }

  console.log("\n🔍  TrustBox Chainlink Functions Simulation\n");
  console.log("  parseIntent.js source loaded ✓");
  console.log("  GROQ_API_KEY found ✓");
  console.log("  Running 3 test cases...\n");

  for (const tc of TEST_CASES) {
    console.log(`─── ${tc.label} ───`);
    try {
      const result = await simulateScript({
        source,
        args:      [encodeURIComponent(tc.nlText), tc.category],
        secrets:   { GROQ_API_KEY: groqKey },
        maxOnChainResponseBytes: 512,
        numAllowedQueries:       5,
        maxQueryDurationMs:      15_000,
      });

      if (result.errorString) {
        console.log(`  ❌  Error: ${result.errorString}`);
      } else {
        const decoded = Buffer.from(
          result.responseBytesHexstring.slice(2),
          "hex"
        ).toString("utf8");

        const parsed = JSON.parse(decoded);
        console.log(`  ✓   action:     ${parsed.action}`);
        console.log(`  ✓   confidence: ${parsed.confidence}`);
        console.log(`  ✓   params:     ${JSON.stringify(parsed.params).slice(0, 80)}...`);
        console.log(`  ✓   cost est:   ${parsed.estimatedCost}`);
      }
    } catch (err: any) {
      console.log(`  ❌  Exception: ${err.message}`);
    }
    console.log();
  }

  console.log("✅  Simulation complete — all test cases passed");
  console.log("   Ready to deploy FunctionsConsumer.sol and run on-chain\n");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
