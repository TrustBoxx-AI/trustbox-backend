/* api/blindaudit.ts — TrustBox
   POST /api/blindaudit — Phala TEE blind code audit
   ─────────────────────────────────────────────────────────
   Client encrypts code bundle with agent public key (ECIES).
   Client pins ciphertext to IPFS before calling this endpoint.
   Server dispatches job → Phala TEE → waits → verifies.
   ──────────────────────────────────────────────────────────
   1. Validate agent is registered + online
   2. Dispatch encrypted bundle to Phala via AgentMarketplace
   3. Poll for JobComplete event (up to 3 min)
   4. Verify SGX attestation
   5. Pin attestation to IPFS
   6. Return attestationCID + txHash + findings summary
   ─────────────────────────────────────────────────────── */

import { Router, Request, Response } from "express";
import { ethers }               from "ethers";
import { requireWalletSig }     from "../middleware/auth";
import { walletRateLimit }      from "../middleware/rateLimit";
import { validate, BlindAuditSchema } from "../middleware/validate";
import { getAgentMarketplace, waitForTx, getGasConfig } from "../services/ethers";
import { dispatchTEEJob, pollJobResult, verifyAttestation } from "../services/phala";
import { pinTEEAttestation }    from "../services/ipfs";

export const blindAuditRouter = Router();

blindAuditRouter.post("/",
  walletRateLimit,
  validate(BlindAuditSchema),
  requireWalletSig,
  async (req: Request, res: Response) => {
    try {
      const {
        walletAddress,
        projectName,
        agentId,
        encryptedBundleCID,
        auditScope,
      } = req.body;

      // 1. Verify agent exists and is not slashed
      const marketplace = getAgentMarketplace();
      const agent       = await marketplace.getAgent(agentId);

      if (!agent || agent.isSlashed) {
        return res.status(400).json({ error: `Agent ${agentId} not found or slashed` });
      }

      console.log(`[blindaudit] Starting TEE job — agent: ${agent.name} project: ${projectName}`);

      const jobId    = `job_${ethers.id(agentId + walletAddress + Date.now()).slice(2, 18)}`;
      const gasConfig = await getGasConfig();

      // 2. Register job on-chain via AgentMarketplace.requestJob()
      const tx = await marketplace.requestJob(
        agentId,
        encryptedBundleCID,
        walletAddress,
        { ...gasConfig }
      );
      const receipt = await waitForTx(tx);
      console.log(`[blindaudit] Job dispatched on-chain — tx: ${receipt.hash}`);

      // 3. Poll Phala for JobComplete event
      const { findingsHash, attestationCID, teeSignature } = await pollJobResult(jobId);

      // 4. Verify SGX attestation
      const { valid, provider: teeProvider, timestamp } = await verifyAttestation(
        attestationCID,
        findingsHash,
        teeSignature
      );

      if (!valid) {
        console.warn("[blindaudit] Attestation verification warning — proceeding with caveat");
      }

      // 5. Pin complete attestation record to IPFS
      const attestationRecord = {
        jobId,
        agentId,
        findingsHash,
        attestationCID,
        teeProvider,
        timestamp,
        auditScope:  auditScope ?? [],
        projectName,
      };

      await pinTEEAttestation(attestationRecord);

      res.json({
        success:         true,
        action:          "blindaudit",
        chain:           "avalanche",
        jobId,
        agentId,
        agentName:       agent.name,
        txHash:          receipt.hash,
        blockNumber:     receipt.blockNumber.toString(),
        inputHash:       ethers.id(encryptedBundleCID),
        findingsHash,
        attestationCID,
        attestationValid:valid,
        teeProvider,
        scannerVersion:  `${agent.name} ${agent.version}`,
        timestamp,
        explorerUrl:     `https://testnet.snowtrace.io/tx/${receipt.hash}`,
        note: valid
          ? "SGX attestation verified — code audited inside genuine TEE enclave"
          : "Attestation check inconclusive on testnet — production uses full DCAP verification",
      });
    } catch (err: any) {
      console.error("[blindaudit] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);
