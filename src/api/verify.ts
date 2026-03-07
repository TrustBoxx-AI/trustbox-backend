/* api/verify.ts — TrustBox
   POST /api/verify/prepare  — compute hashes + pin metadata (no mint yet)
   POST /api/verify/mint     — human approved + signed → mint ERC-8004
   ─────────────────────────────────────────────────────────────────────
   Human-in-the-loop flow:
     1. Frontend calls /prepare → backend returns agentId, modelHash, CID
     2. Frontend shows summary card → user clicks "Approve & Sign"
     3. MetaMask signs approval message client-side
     4. Frontend calls /mint with signature → backend mints credential
   ──────────────────────────────────────────────────────────────────── */

import { Router, Request, Response } from "express";
import { ethers }             from "ethers";
import { requireWalletSig }   from "../middleware/auth";
import { walletRateLimit }    from "../middleware/rateLimit";
import { validate, VerifySchema, VerifyMintSchema } from "../middleware/validate";
import { getTrustRegistry, waitForTx, getGasConfig } from "../services/ethers";
import { pinAgentMetadata }   from "../services/ipfs";

export const verifyRouter = Router();

// ── POST /api/verify/prepare ──────────────────────────────────
// Computes hashes and pins metadata. Does NOT mint.
// Returns data for human review + approval message to sign.
verifyRouter.post("/prepare",
  walletRateLimit,
  validate(VerifySchema),
  requireWalletSig,
  async (req: Request, res: Response) => {
    try {
      const { walletAddress, agentName, model, operator, capabilities, environment } = req.body;

      const capsArray  = capabilities.split(",").map((c: string) => c.trim()).filter(Boolean);
      const agentId    = `agt_${ethers.id(agentName + operator + Date.now()).slice(2, 14)}`;
      const modelHash  = ethers.id(`${model}:${capsArray.join(",")}`);
      const capHash    = ethers.id(capsArray.join(","));
      const trustScore = 85;
      const mintedAt   = new Date().toISOString();

      // Pin metadata to IPFS
      const { cid, url } = await pinAgentMetadata({
        agentId, name: agentName, model, operator,
        capabilities: capsArray, environment,
        modelHash, trustScore, mintedAt,
      });

      console.log(`[verify/prepare] Metadata pinned — CID: ${cid}`);

      // Build the message the user will sign in MetaMask
      // This is the human approval — signing proves they reviewed and authorised the mint
      const approvalMessage = [
        "TrustBox Agent Credential Approval",
        "────────────────────────────────────",
        `Agent ID:    ${agentId}`,
        `Agent Name:  ${agentName}`,
        `Model:       ${model}`,
        `Operator:    ${operator}`,
        `Capabilities:${capsArray.join(", ")}`,
        `Model Hash:  ${modelHash}`,
        `Metadata:    ipfs://${cid}`,
        "────────────────────────────────────",
        "By signing you authorise minting this",
        "ERC-8004 credential on Avalanche Fuji.",
      ].join("\n");

      res.json({
        ok:              true,
        prepared:        true,
        agentId,
        agentName,
        model,
        operator,
        capabilities:    capsArray,
        modelHash,
        capHash,
        metadataCID:     cid,
        metadataURL:     url,
        trustScore,
        mintedAt,
        approvalMessage, // frontend passes this to MetaMask personal_sign
        metadataURI:     `ipfs://${cid}`,
      });
    } catch (err: any) {
      console.error("[verify/prepare] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// ── POST /api/verify/mint ─────────────────────────────────────
// Human has reviewed + signed. Now mint the ERC-8004 credential.
verifyRouter.post("/mint",
  walletRateLimit,
  validate(VerifyMintSchema),
  requireWalletSig,
  async (req: Request, res: Response) => {
    try {
      const {
        walletAddress,
        agentId,
        modelHash,
        capHash,
        metadataURI,
        approvalMessage,
        approvalSignature,
        trustScore,
      } = req.body;

      // Verify the approval signature — confirm human actually signed
      const recoveredAddress = ethers.verifyMessage(approvalMessage, approvalSignature);
      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        return res.status(400).json({
          error: "Approval signature mismatch — signature must be from the operator wallet",
        });
      }

      console.log(`[verify/mint] Approval verified — signer: ${recoveredAddress}`);

      // Mint ERC-8004 on TrustRegistry
      const registry  = getTrustRegistry();
      const gasConfig = await getGasConfig();

      const tx = await registry.mintCredential(
        agentId,
        modelHash,
        walletAddress,
        capHash,
        metadataURI,
        { ...gasConfig }
      );

      const receipt = await waitForTx(tx);
      console.log(`[verify/mint] ERC-8004 minted — tx: ${receipt.hash}`);

      // Extract tokenId from AgentRegistered event
      let tokenId = "0";
      for (const log of receipt.logs) {
        try {
          const parsed = registry.interface.parseLog(log);
          if (parsed?.name === "AgentRegistered") {
            tokenId = parsed.args.tokenId.toString();
          }
        } catch { /* skip */ }
      }

      const registryAddr = await registry.getAddress();

      res.json({
        success:       true,
        ok:            true,
        action:        "verify",
        tokenId,
        agentId,
        modelHash,
        metadataCID:   metadataURI.replace("ipfs://", ""),
        metadataURI,
        txHash:        receipt.hash,
        blockNumber:   receipt.blockNumber.toString(),
        gasUsed:       receipt.gasUsed.toString(),
        approvedBy:    recoveredAddress,
        explorerUrl:   `https://testnet.snowtrace.io/tx/${receipt.hash}`,
        tokenExplorer: `https://testnet.snowtrace.io/token/${registryAddr}?a=${tokenId}`,
        agentScore:    trustScore ?? 85,
        issuer:        "TrustBox TrustRegistry v1.0",
      });
    } catch (err: any) {
      console.error("[verify/mint] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);