/* scripts/utils/exportAbis.ts
   Export compiled contract ABIs to src/contracts/abis/
   Run after: npx hardhat compile
   Run: npx ts-node scripts/utils/exportAbis.ts
   ─────────────────────────────────────────────────── */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const ARTIFACTS_DIR = join(__dirname, "../../artifacts/contracts");
const OUT_DIR       = join(__dirname, "../../src/contracts/abis");

const CONTRACTS = [
  "TrustRegistry",
  "AuditRegistry",
  "AgentMarketplace",
  "IntentVault",
  "FunctionsConsumer",
];

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log("\n📦  Exporting ABIs to src/contracts/abis/\n");

  for (const name of CONTRACTS) {
    try {
      const artifactPath = join(ARTIFACTS_DIR, `${name}.sol`, `${name}.json`);
      const artifact     = JSON.parse(readFileSync(artifactPath, "utf8"));
      const outPath      = join(OUT_DIR, `${name}.json`);
      writeFileSync(outPath, JSON.stringify(artifact.abi, null, 2));
      console.log(`  ✓  ${name}.json  (${artifact.abi.length} entries)`);
    } catch (err: any) {
      console.warn(`  ⚠  ${name} — ${err.message}`);
    }
  }

  console.log("\n  Done. Update chains.js with deployed contract addresses.\n");
}

main();
