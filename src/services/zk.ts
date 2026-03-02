/* services/zk.ts — TrustBox
   snarkjs Groth16 verifier for credit score proofs.
   Proving happens client-side (browser Web Worker).
   Server only verifies — never generates the proof.
   ─────────────────────────────────────────────────── */

import * as snarkjs from "snarkjs";
import { readFileSync, existsSync } from "fs";
import { env } from "../config/env";

// ── Load verification key (once) ─────────────────────────────
let _vKey: object | null = null;

function getVerificationKey(): object {
  if (_vKey) return _vKey;

  if (!existsSync(env.ZK_VKEY_PATH)) {
    throw new Error(
      `ZK verification key not found at ${env.ZK_VKEY_PATH} — ` +
      `compile CreditScore.circom circuit first (Session 11)`
    );
  }

  _vKey = JSON.parse(readFileSync(env.ZK_VKEY_PATH, "utf8"));
  return _vKey!;
}

// ── Verify a Groth16 proof ───────────────────────────────────
export async function verifyProof(
  proof:         object,
  publicSignals: string[]
): Promise<{ valid: boolean; scoreHash: string; scoreBand: number }> {
  const vKey  = getVerificationKey();
  const valid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

  // Public signals layout (from circuit):
  // publicSignals[0] = scoreHash (keccak256 of actual score)
  // publicSignals[1] = scoreBand (1=Poor, 2=Fair, 3=Good, 4=Excellent)
  const scoreHash = publicSignals[0] ?? "0x0";
  const scoreBand = Number(publicSignals[1] ?? 0);

  if (!valid) {
    console.warn("[zk] Proof verification failed — invalid proof or tampered public signals");
  }

  return { valid, scoreHash, scoreBand };
}

// ── Score band to label ──────────────────────────────────────
export function scoreBandLabel(band: number): string {
  return (
    band === 1 ? "Poor"      :
    band === 2 ? "Fair"      :
    band === 3 ? "Good"      :
    band === 4 ? "Excellent" :
    "Unknown"
  );
}

// ── Score band to approximate range ─────────────────────────
export function scoreBandRange(band: number): string {
  return (
    band === 1 ? "300–579" :
    band === 2 ? "580–669" :
    band === 3 ? "670–739" :
    band === 4 ? "740–850" :
    "Unknown"
  );
}

// ── Check circuit files exist ────────────────────────────────
export function zkCircuitReady(): boolean {
  return existsSync(env.ZK_VKEY_PATH) &&
         existsSync(env.ZK_WASM_PATH) &&
         existsSync(env.ZK_ZKEY_PATH);
}
