/* api/proof.ts — TrustBox Backend
   GET /api/proof/:action/:id
   Fetches a proof record by action type and ID (tx hash / token ID / seq num).
   Used by ProofPanel.jsx to display real proof data.
   ─────────────────────────────────────────────────────── */

import { Router }   from "express";
import { apiLimiter } from "../middleware/rateLimit";
import { getProvider, trustRegistry, auditRegistry } from "../services/ethers";
import { fetchJson } from "../services/ipfs";
import { getHcsMessage } from "../services/hedera";
import { HCS_TOPICS, CONTRACTS } from "../config/chains";

export const proofRouter = Router();

proofRouter.get("/:action/:id", apiLimiter, async (req, res) => {
  const { action, id } = req.params;

  try {
    let proof: Record<string, unknown> = {};

    switch (action) {
      case "verify": {
        // id = tokenId
        const registry = trustRegistry();
        const record   = await registry["verifyAgent"](BigInt(id)) as Record<string, unknown>;
        proof = { action: "verify", tokenId: id, ...record };
        break;
      }

      case "audit": {
        // id = contract address
        const registry = auditRegistry();
        const record   = await registry["getAudit"](id) as Record<string, unknown>;
        proof = { action: "audit", auditedContract: id, ...record };
        break;
      }

      case "score": {
        // id = HCS sequence number
        if (!HCS_TOPICS.creditScore) {
          res.status(503).json({ ok: false, code: "HCS_NOT_CONFIGURED", message: "HCS topics not configured" });
          return;
        }
        const msg = await getHcsMessage(HCS_TOPICS.creditScore, id);
        proof = { action: "score", sequenceNum: id, ...msg };
        break;
      }

      case "blindaudit": {
        // id = attestation CID
        const attestation = await fetchJson(id);
        proof = { action: "blindaudit", attestationCID: id, ...attestation };
        break;
      }

      case "execute": {
        // id = intentId
        const vault  = (await import("../services/ethers")).intentVault();
        const intent = await vault["getIntent"](BigInt(id)) as Record<string, unknown>;
        proof = { action: "execute", intentId: id, ...intent };
        break;
      }

      default:
        res.status(400).json({ ok: false, code: "INVALID_ACTION", message: `Unknown action: ${action}` });
        return;
    }

    res.json({ ok: true, data: proof });
  } catch (err) {
    res.status(500).json({
      ok:      false,
      code:    "PROOF_FETCH_FAILED",
      message: (err as Error).message,
    });
  }
});
