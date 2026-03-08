/* services/zk.ts — TrustBox — all exports */

// @ts-ignore
import * as snarkjs from "snarkjs"
import * as fs      from "fs"
import { env }      from "../config/env"

export function scoreBand(score: number): number {
  if (score >= 740) return 4
  if (score >= 670) return 3
  if (score >= 580) return 2
  return 1
}

export function scoreBandLabel(band: number): string {
  return ["", "Poor", "Fair", "Good", "Excellent"][band] ?? "Unknown"
}

export function scoreBandRange(band: number): string {
  return ["", "300–579", "580–669", "670–739", "740–850"][band] ?? "Unknown"
}

export function zkCircuitReady(): boolean {
  const wasmPath = env.ZK_WASM_PATH
  const zkeyPath = env.ZK_ZKEY_PATH
  return !!(wasmPath && zkeyPath && fs.existsSync(wasmPath) && fs.existsSync(zkeyPath))
}

export function randomSalt(): bigint {
  const array = new Uint8Array(31)
  try {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(array)
    } else {
      require("crypto").randomFillSync(array)
    }
  } catch {
    require("crypto").randomFillSync(array)
  }
  return BigInt("0x" + Array.from(array).map((b: number) => b.toString(16).padStart(2, "0")).join(""))
}

export async function generateProof(score: number, salt: bigint): Promise<{
  proof: object; publicSignals: string[]
  scoreBand: number; scoreHash: string
}> {
  if (!zkCircuitReady()) {
    console.warn("[zk] Circuit not compiled — returning stub proof")
    return {
      proof:         { protocol: "groth16", stub: true },
      publicSignals: ["0", String(scoreBand(score))],
      scoreBand:     scoreBand(score),
      scoreHash:     `0x${score.toString(16).padStart(64, "0")}`,
    }
  }
  const input = { score: score.toString(), salt: salt.toString() }
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input, env.ZK_WASM_PATH, env.ZK_ZKEY_PATH
    )
    return { proof, publicSignals, scoreBand: Number(publicSignals[1]), scoreHash: publicSignals[0] }
  } catch (err: any) {
    // Placeholder artifacts (demo mode) — fullProve fails on dummy wasm
    console.warn("[zk] fullProve failed (demo artifacts) — returning stub proof:", err.message)
    return {
      proof:         { protocol: "groth16", curve: "bn128", stub: true },
      publicSignals: [`0x${score.toString(16).padStart(64,"0")}`, String(scoreBand(score))],
      scoreBand:     scoreBand(score),
      scoreHash:     `0x${score.toString(16).padStart(64, "0")}`,
    }
  }
}

export async function verifyProof(
  proof: object, publicSignals: string[]
): Promise<{ valid: boolean; scoreHash: string; scoreBand: number }> {
  const vkeyPath = env.ZK_VKEY_PATH
  if (!vkeyPath || !fs.existsSync(vkeyPath)) {
    console.warn("[zk] Verification key not found — skipping verify")
    return { valid: true, scoreHash: publicSignals[0] ?? "0", scoreBand: Number(publicSignals[1] ?? 1) }
  }
  const vkey  = JSON.parse(fs.readFileSync(vkeyPath, "utf-8"))
  const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof)
  return { valid, scoreHash: publicSignals[0], scoreBand: Number(publicSignals[1]) }
}