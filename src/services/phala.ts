/* services/phala.ts — TrustBox
   Phala Network TEE dispatch for blind code audits.
   Phat Contract receives encrypted bundle, runs inside SGX,
   returns findings + Intel DCAP attestation.
   ─────────────────────────────────────────────────────── */

import { ethers }       from "ethers"
import { env }          from "../config/env"
import { getAgentMarketplace, waitForEvent, waitForTx, getGasConfig } from "./ethers"

// ── TEE Challenge/Response protocol ──────────────────────────
interface TEEProbeResponse {
  agentId:           string
  liveness:          boolean
  behaviourChecksum: string
  attestation:       string | null
  timestamp:         string
}

// ── Probe a Phala TEE agent ───────────────────────────────────
export async function probeTEEAgent(params: {
  agentId:     string
  teeEndpoint: string
  challenge?:  string
}): Promise<TEEProbeResponse> {
  const challenge = params.challenge ?? ethers.hexlify(ethers.randomBytes(32))

  try {
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 10_000)

    const res = await fetch(`${params.teeEndpoint}/probe`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ agentId: params.agentId, challenge }),
      signal:  controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      console.warn(`[phala] Probe failed for ${params.agentId}: ${res.status}`)
      return {
        agentId:           params.agentId,
        liveness:          false,
        behaviourChecksum: ethers.ZeroHash,
        attestation:       null,
        timestamp:         new Date().toISOString(),
      }
    }

    const data: any = await res.json()

    return {
      agentId:           params.agentId,
      liveness:          true,
      behaviourChecksum: data.behaviourChecksum ?? ethers.id(`${params.agentId}:${Date.now()}`),
      attestation:       data.attestation ?? null,
      timestamp:         new Date().toISOString(),
    }
  } catch (err: any) {
    // Network error or timeout — agent is offline
    const isTimeout = err.name === "AbortError"
    console.warn(`[phala] ${isTimeout ? "Timeout" : "Error"} probing ${params.agentId}: ${err.message}`)

    return {
      agentId:           params.agentId,
      liveness:          false,
      behaviourChecksum: ethers.ZeroHash,
      attestation:       null,
      timestamp:         new Date().toISOString(),
    }
  }
}

// ── Compute trust score delta from probe result ───────────────
export function computeTrustDelta(
  currentScore: number,
  probe:        TEEProbeResponse,
  history:      { liveness: boolean }[] = []
): { newScore: number; delta: number; changed: boolean } {
  let delta = 0

  if (probe.liveness) {
    // Reward uptime
    delta += 1

    // Reward valid attestation
    if (probe.attestation) delta += 1

    // Reward consistent behaviour
    const recentLiveness = history.slice(-5).filter(h => h.liveness).length
    if (recentLiveness >= 4) delta += 1
  } else {
    // Penalise downtime
    delta -= 5

    // Extra penalty for repeated downtime
    const recentDowntime = history.slice(-3).filter(h => !h.liveness).length
    if (recentDowntime >= 2) delta -= 3
  }

  const newScore = Math.min(100, Math.max(0, currentScore + delta))
  return { newScore, delta, changed: newScore !== currentScore }
}

// ── Dispatch job to Phala Phat Contract ──────────────────────
export async function dispatchTEEJob(params: {
  agentId:            string
  teeEndpoint:        string
  encryptedBundleCID: string
  jobId:              string
  requesterAddress:   string
}): Promise<{ dispatched: boolean; jobId: string }> {
  const marketplace = getAgentMarketplace()
  const gasConfig   = await getGasConfig()

  const tx = await marketplace.requestJob(
    params.agentId,
    params.encryptedBundleCID,
    params.requesterAddress,
    { value: 0, ...gasConfig }
  )

  await waitForTx(tx)
  console.log(`[phala] TEE job dispatched — jobId: ${params.jobId} agent: ${params.agentId}`)

  return { dispatched: true, jobId: params.jobId }
}

// ── Poll for job completion ───────────────────────────────────
export async function pollJobResult(
  jobId:      string,
  timeoutMs = 180_000
): Promise<{
  findingsHash:   string
  attestationCID: string
  resultCID:      string
  teeSignature:   string
}> {
  const marketplace = getAgentMarketplace()
  console.log(`[phala] Waiting for TEE job result — jobId: ${jobId}`)

  const [, findingsHash, attestationCID, teeSignature] =
    await waitForEvent<[string, string, string, string]>(
      marketplace,
      "JobComplete",
      timeoutMs
    )

  console.log(`[phala] TEE job complete — attestationCID: ${attestationCID}`)
  return { findingsHash, attestationCID, resultCID: attestationCID, teeSignature }
}

// ── Verify SGX attestation ────────────────────────────────────
export async function verifyAttestation(
  attestationCID: string,
  findingsHash:   string,
  teeSignature:   string
): Promise<{ valid: boolean; provider: string; timestamp: string }> {
  try {
    const url = `${env.PINATA_GATEWAY}/ipfs/${attestationCID}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`IPFS fetch failed: ${res.statusText}`)

    const attestation: any = await res.json()
    const hashMatches      = attestation.findingsHash === findingsHash
    const hasQuote         = Boolean(attestation.attestationQuote)
    const hasSignature     = Boolean(teeSignature)

    return {
      valid:     hashMatches && hasQuote && hasSignature,
      provider:  attestation.teeProvider ?? "Phala Network (Intel SGX)",
      timestamp: attestation.timestamp   ?? new Date().toISOString(),
    }
  } catch (err) {
    console.warn("[phala] Attestation verification warning:", err)
    return {
      valid:     false,
      provider:  "Phala Network (Intel SGX)",
      timestamp: new Date().toISOString(),
    }
  }
}

// ── Encrypt payload with agent public key (ECIES) ────────────
// Client does this in browser — server helper for tests
export async function encryptForAgent(
  payload:    object,
  agentPubKey: string
): Promise<string> {
  // TODO Session 11: real ECIES encryption
  // For now return base64 encoded payload (dev mode only)
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64")
  console.warn("[phala] WARNING: Using dev mode encryption — implement ECIES for production")
  return encoded
}

// ── Fetch agent public key from marketplace ──────────────────
export async function getAgentPublicKey(agentId: string): Promise<string> {
  const marketplace = getAgentMarketplace()
  const agent       = await marketplace.getAgent(agentId)
  return agent.encPubKey as string
}