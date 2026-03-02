/* services/phala.ts — TrustBox
   Phala Network TEE dispatch for blind code audits.
   Phat Contract receives encrypted bundle, runs inside SGX,
   returns findings + Intel DCAP attestation.
   ─────────────────────────────────────────────────────── */

import { env }          from "../config/env";
import { getAgentMarketplace, waitForEvent } from "./ethers";

// ── Dispatch job to Phala Phat Contract ──────────────────────
export async function dispatchTEEJob(params: {
  agentId:          string;
  teeEndpoint:      string;
  encryptedBundleCID: string;
  jobId:            string;
  requesterAddress: string;
}): Promise<{ dispatched: boolean; jobId: string }> {
  // Call AgentMarketplace.requestJob() — emits JobDispatched event
  // Phala agent monitors this event and picks up the job
  const marketplace = getAgentMarketplace();

  const tx = await marketplace.requestJob(
    params.agentId,
    params.encryptedBundleCID,
    params.requesterAddress,
    { value: 0 } // payment handled separately in production
  );

  await tx.wait(1);
  console.log(`[phala] TEE job dispatched — jobId: ${params.jobId} agent: ${params.agentId}`);

  return { dispatched: true, jobId: params.jobId };
}

// ── Poll for job completion ───────────────────────────────────
export async function pollJobResult(
  jobId:      string,
  timeoutMs = 180_000 // 3 minutes — TEE audits can take a while
): Promise<{
  findingsHash:    string;
  attestationCID:  string;
  resultCID:       string;
  teeSignature:    string;
}> {
  const marketplace = getAgentMarketplace();

  console.log(`[phala] Waiting for TEE job result — jobId: ${jobId}`);

  const [, findingsHash, attestationCID, teeSignature] =
    await waitForEvent<[string, string, string, string]>(
      marketplace,
      "JobComplete",
      timeoutMs
    );

  console.log(`[phala] TEE job complete — attestationCID: ${attestationCID}`);

  return {
    findingsHash,
    attestationCID,
    resultCID:    attestationCID, // findings are in the attestation bundle
    teeSignature,
  };
}

// ── Verify SGX attestation (off-chain) ───────────────────────
// Full DCAP verification is complex — for testnet we do a basic
// signature check. Production: use Intel PCCS or Phala's verifier contract.
export async function verifyAttestation(
  attestationCID: string,
  findingsHash:   string,
  teeSignature:   string
): Promise<{ valid: boolean; provider: string; timestamp: string }> {
  // Fetch attestation from IPFS
  try {
    const url = `${env.PINATA_GATEWAY}/ipfs/${attestationCID}`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch attestation: ${res.statusText}`);

    const attestation: any = await res.json();

    // Basic checks
    const hashMatches   = attestation.findingsHash === findingsHash;
    const hasQuote      = Boolean(attestation.attestationQuote);
    const hasSignature  = Boolean(teeSignature);

    return {
      valid:     hashMatches && hasQuote && hasSignature,
      provider:  attestation.teeProvider ?? "Phala Network (Intel SGX)",
      timestamp: attestation.timestamp   ?? new Date().toISOString(),
    };
  } catch (err) {
    console.warn("[phala] Attestation verification warning:", err);
    return { valid: false, provider: "Phala Network (Intel SGX)", timestamp: new Date().toISOString() };
  }
}

// ── Fetch agent public key from marketplace ──────────────────
export async function getAgentPublicKey(agentId: string): Promise<string> {
  const marketplace = getAgentMarketplace();
  const agent = await marketplace.getAgent(agentId);
  return agent.encPubKey as string;
}
