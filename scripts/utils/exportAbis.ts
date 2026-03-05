/**
 * scripts/utils/exportAbis.ts
 * ───────────────────────────
 * Copies compiled contract ABIs from hardhat artifacts
 * into src/contracts/abis/ so the Express API can load them.
 *
 * Run after every `bun run compile`:
 *   bun run export:abis
 */

import * as fs   from "fs"
import * as path from "path"

const ARTIFACTS_DIR = path.resolve(__dirname, "../../artifacts/contracts")
const OUTPUT_DIR    = path.resolve(__dirname, "../../src/contracts/abis")

const CONTRACTS = [
  "TrustRegistry",
  "AuditRegistry",
  "IntentVault",
  "AgentMarketplace",
]

function findArtifact(contractName: string): string | null {
  // Hardhat stores artifacts at: artifacts/contracts/<Name>.sol/<Name>.json
  const candidates = [
    path.join(ARTIFACTS_DIR, `${contractName}.sol`, `${contractName}.json`),
    // Also check nested paths (libraries, interfaces)
    path.join(ARTIFACTS_DIR, "libraries", `${contractName}.sol`, `${contractName}.json`),
    path.join(ARTIFACTS_DIR, "interfaces", `${contractName}.sol`, `${contractName}.json`),
  ]

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function exportAbis() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  console.log("═══════════════════════════════════════════")
  console.log("  TrustBox — ABI Export")
  console.log("═══════════════════════════════════════════\n")

  let exported = 0
  let missing  = 0

  for (const name of CONTRACTS) {
    const artifactPath = findArtifact(name)

    if (!artifactPath) {
      console.warn(`  ⚠  ${name.padEnd(20)} — artifact not found (run: bun run compile)`)
      missing++

      // Write empty placeholder so loadAbi() doesn't crash
      const placeholder = path.join(OUTPUT_DIR, `${name}.json`)
      if (!fs.existsSync(placeholder)) {
        fs.writeFileSync(placeholder, JSON.stringify([], null, 2))
        console.log(`  📄 ${name.padEnd(20)} — placeholder written`)
      }
      continue
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"))
    const abi      = artifact.abi

    if (!abi || abi.length === 0) {
      console.warn(`  ⚠  ${name.padEnd(20)} — empty ABI`)
      missing++
      continue
    }

    const outputPath = path.join(OUTPUT_DIR, `${name}.json`)
    fs.writeFileSync(outputPath, JSON.stringify(abi, null, 2))

    const fnCount    = abi.filter((x: any) => x.type === "function").length
    const eventCount = abi.filter((x: any) => x.type === "event").length
    console.log(`  ✅ ${name.padEnd(20)} — ${fnCount} functions, ${eventCount} events`)
    exported++
  }

  console.log(`\n  Exported : ${exported}`)
  console.log(`  Missing  : ${missing}`)
  console.log(`  Output   : ${OUTPUT_DIR}`)
  console.log("\n═══════════════════════════════════════════\n")

  if (missing > 0) {
    console.log("  Run 'bun run compile' first to generate all artifacts.\n")
  }
}

exportAbis()