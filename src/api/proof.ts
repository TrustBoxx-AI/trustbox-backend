/* api/proof.ts — TrustBox Backend
   GET /api/proof/:action/:id
   Fetches a proof record by action type and ID.
   ─────────────────────────────────────────────────────── */

import { Router }   from "express";
import { apiLimiter } from "../middleware/rateLimit";
import { getTrustRegistry, getAuditRegistry, getIntentVault } from "../services/ethers";
import { fetchJSON }    from "../services/ipfs";
import { fetchHCSMessage } from "../services/hedera";
import { HEDERA_CONFIG, CONTRACTS } from "../config/chains";

const HCS_TOPICS = HEDERA_CONFIG.topics;

export const proofRouter = Router();

proofRouter.get("/:action/:id", apiLimiter, async (req, res) => {
  const { action, id } = req.params;

  try {
    let proof: Record<string, unknown> = {};

    switch (action) {
      case "verify": {
        const registry = getTrustRegistry();
        const record   = await registry["verifyAgent"](BigInt(id)) as Record<string, unknown>;
        proof = { action: "verify", tokenId: id, ...record };
        break;
      }

      case "audit": {
        const registry = getAuditRegistry();
        const record   = await registry["getAudit"](id) as Record<string, unknown>;
        proof = { action: "audit", auditedContract: id, ...record };
        break;
      }

      case "score": {
        if (!HCS_TOPICS.creditScore) {
          res.status(503).json({ ok: false, code: "HCS_NOT_CONFIGURED", message: "HCS topics not configured" });
          return;
        }
        const msg = await fetchHCSMessage(HCS_TOPICS.creditScore, id);
        proof = { action: "score", sequenceNum: id, ...msg };
        break;
      }

      case "blindaudit": {
        const attestation = await fetchJSON(id);
        proof = { action: "blindaudit", attestationCID: id, ...attestation };
        break;
      }

      case "execute": {
        const vault  = getIntentVault();
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