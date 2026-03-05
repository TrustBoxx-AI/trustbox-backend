/**
 * zk/proveScore.ts
 * ─────────────────
 * Client-side ZK proof generation for credit scores.
 * Called from frontend (Web Worker) or server-side tests.
 *
 * Usage:
 *   const { proof, publicSignals } = await proveScore(742, randomSalt())
 *   // proof + publicSignals sent to POST /api/score
 */

import * as snarkjs from "snarkjs"
import * as path    from "path"
import * as crypto  from "crypto"

const WASM_PATH = path.resolve(__dirname, "../zk/CreditScore_js/CreditScore.wasm")
const ZKEY_PATH = path.resolve(__dirname, "../zk/CreditScore_final.zkey")

// ── Generate random salt ──────────────────────────────────────
export function randomSalt(): bigint {
  const bytes = crypto.randomBytes(31)  // 31 bytes = 248 bits < field size
  return BigInt("0x" + bytes.toString("hex"))
}

// ── Generate ZK proof for a credit score ─────────────────────
export async function proveScore(
  score: number,
  salt?: bigint
): Promise<{
  proof:         object
  publicSignals: string[]
  scoreBand:     number
  scoreHash:     string
}> {
  if (score < 300 || score > 850) {
    throw new Error(`Score must be between 300 and 850, got ${score}`)
  }

  const s = salt ?? randomSalt()

  const input = {
    score: score.toString(),
    salt:  s.toString(),
  }

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    WASM_PATH,
    ZKEY_PATH
  )

  const scoreHash = publicSignals[0]
  const scoreBand = Number(publicSignals[1])

  return { proof, publicSignals, scoreBand, scoreHash }
}

// ── Verify a proof (server-side check) ───────────────────────
export async function verifyScoreProof(
  proof:         object,
  publicSignals: string[]
): Promise<boolean> {
  const vkeyPath = path.resolve(__dirname, "../zk/verification_key.json")
  const vkey     = require(vkeyPath)
  return snarkjs.groth16.verify(vkey, publicSignals, proof)
}

// ── Score band helpers ────────────────────────────────────────
export function bandLabel(band: number): string {
  return ["", "Poor", "Fair", "Good", "Excellent"][band] ?? "Unknown"
}

export function bandRange(band: number): string {
  return ["", "300–579", "580–669", "670–739", "740–850"][band] ?? "Unknown"
}

// ── CLI test (run: ts-node zk/proveScore.ts) ─────────────────
if (require.main === module) {
  const testScore = 742
  console.log(`\nGenerating ZK proof for score: ${testScore}`)
  console.log("(This takes ~10–30s on first run)\n")

  proveScore(testScore)
    .then(({ scoreBand, scoreHash, proof }) => {
      console.log(`✅ Score band : ${scoreBand} (${bandLabel(scoreBand)})`)
      console.log(`✅ Score hash : ${scoreHash}`)
      console.log(`✅ Proof size : ${JSON.stringify(proof).length} bytes`)
      console.log("\nProof generated successfully!")
    })
    .catch(err => {
      console.error("❌ Proof failed:", err.message)
      console.error("   Run 'bash zk/compile.sh' first to compile the circuit")
    })
}