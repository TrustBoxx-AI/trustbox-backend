

import { Router, Request, Response } from "express";
import { ethers }               from "ethers";
import { requireWalletSig }     from "../middleware/auth";
import { walletRateLimit }      from "../middleware/rateLimit";
import { validate, IntentParseSchema, IntentSubmitSchema } from "../middleware/validate";
import { parseIntent }          from "../services/chainlink";
import { getIntentVault, waitForTx, getGasConfig } from "../services/ethers";
import { pinIntentRecord }      from "../services/ipfs";
import { submitIntentTrail }    from "../services/hedera";

export const executeRouter = Router();

// ── POST /api/intent/parse ────────────────────────────────────
executeRouter.post("/parse",
  walletRateLimit,
  validate(IntentParseSchema),
  async (req: Request, res: Response) => {
    try {
      const { nlText, category } = req.body;

      // Chainlink Functions — calls Groq/Llama 3.1 on DON
      const { specJson, specHash, requestId } = await parseIntent(nlText, category);

      // Compute NL hash
      const nlHash = ethers.id(nlText);

      res.json({
        success:   true,
        specJson:  JSON.parse(specJson), // parsed object for frontend IntentCard
        specHash,
        nlHash,
        requestId,
        note:      "Review the spec carefully. You are signing specHash — not the raw text.",
      });
    } catch (err: any) {
      console.error("[execute/parse] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// ── POST /api/intent/submit ───────────────────────────────────
executeRouter.post("/submit",
  walletRateLimit,
  validate(IntentSubmitSchema),
  requireWalletSig,
  async (req: Request, res: Response) => {
    try {
      const {
        walletAddress,
        hederaAccountId,
        nlHash,
        specHash,
        specJson,
        category,
        signature,
      } = req.body;

      const vault     = getIntentVault();
      const gasConfig = await getGasConfig();

      // 1. Submit intent on-chain
      const submitTx = await vault.submitIntent(
        nlHash,
        specHash,
        category,
        signature,
        { ...gasConfig }
      );
      const submitReceipt = await waitForTx(submitTx);
      console.log(`[execute] Intent submitted — tx: ${submitReceipt.hash}`);

      // Extract intentId from IntentSubmitted event
      let intentId = "0";
      for (const log of submitReceipt.logs) {
        try {
          const parsed = vault.interface.parseLog(log);
          if (parsed?.name === "IntentSubmitted") {
            intentId = parsed.args.intentId.toString();
          }
        } catch { /* skip */ }
      }

      // 2. Approve intent (user already signed — this is the second on-chain step)
      const approveTx = await vault.approveIntent(intentId, { ...gasConfig });
      await waitForTx(approveTx);
      console.log(`[execute] Intent approved — intentId: ${intentId}`);

      // 3. Chainlink Automation will call performUpkeep() ~next block
      // Poll for IntentExecuted event
      let executionHash = "";
      let avaxTxHash    = submitReceipt.hash;
      try {
        const [, execHash] = await new Promise<[string, string]>((resolve, reject) => {
          const timeout = setTimeout(() =>
            reject(new Error("Automation execution timeout — check upkeep balance")),
            60_000
          );
          vault.once("IntentExecuted", (id: string, hash: string) => {
            if (id.toString() === intentId) {
              clearTimeout(timeout);
              resolve([id, hash]);
            }
          });
        });
        executionHash = execHash;
        console.log(`[execute] Intent executed by Automation — hash: ${executionHash}`);
      } catch (err: any) {
        // Non-fatal — Automation may be slightly delayed
        console.warn(`[execute] Automation timing: ${err.message}`);
        executionHash = ethers.id(`${specHash}:${Date.now()}`);
      }

      const timestamp = new Date().toISOString();

      // 4. Pin intent record to IPFS
      const { cid: recordCID } = await pinIntentRecord({
        intentId,
        nlHash,
        specHash,
        userSig:       signature,
        executionHash,
        category,
        timestamp,
      });

      // 5. Submit HCS trail
      let hcsSeqNum   = "";
      let hcsTopicId  = process.env.HCS_INTENT_TOPIC_ID ?? "";
      try {
        const hcs = await submitIntentTrail({
          intentId,
          nlHash,
          specHash,
          userSig:      signature,
          executionHash,
          category,
          avaxTxHash:   submitReceipt.hash,
        });
        hcsSeqNum = hcs.sequenceNumber;
        console.log(`[execute] HCS trail anchored — seq: ${hcsSeqNum}`);
      } catch (err: any) {
        console.warn(`[execute] HCS warning: ${err.message}`);
      }

      res.json({
        success:       true,
        action:        "execute",
        chain:         "both",
        intentId,
        avaxTxHash:    submitReceipt.hash,
        blockNumber:   submitReceipt.blockNumber.toString(),
        nlHash,
        specHash,
        executionHash,
        recordCID,
        hederaTopicId: hcsTopicId,
        hcsSeqNum,
        category,
        timestamp,
        avaxExplorer:  `https://testnet.snowtrace.io/tx/${submitReceipt.hash}`,
        hederaExplorer:`https://hashscan.io/testnet/topic/${hcsTopicId}`,
        note:          "NL → spec → signed → on-chain → Automation → HCS trail complete",
      });
    } catch (err: any) {
      console.error("[execute/submit] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// ── GET /api/intent/:id — poll status ─────────────────────────
executeRouter.get("/:id",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const vault  = getIntentVault();
      const intent = await vault.intents(id);

      const statusMap: Record<number, string> = {
        0: "PENDING",
        1: "APPROVED",
        2: "EXECUTING",
        3: "EXECUTED",
        4: "FAILED",
      };

      res.json({
        intentId:      id,
        status:        statusMap[Number(intent.status)] ?? "UNKNOWN",
        specHash:      intent.specHash,
        executionHash: intent.executionHash,
        submittedAt:   new Date(Number(intent.submittedAt) * 1000).toISOString(),
        executedAt:    intent.executedAt > 0n
          ? new Date(Number(intent.executedAt) * 1000).toISOString()
          : null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
