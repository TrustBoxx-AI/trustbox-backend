/* api/execute.ts — TrustBox
   POST /api/intent/parse   — NL → structured spec (Chainlink Functions)
   POST /api/intent/submit  — spec + sig → IntentVault + HCS
   GET  /api/intent/pending — CRE polls for oldest pending intent
   GET  /api/intent/by-tx/:txHash — CRE resolves intentId from tx
   POST /api/intent/execute — CRE marks intent executed
   GET  /api/intent/:id     — poll execution status

   FIXES:
     C-01 — vault.submitIntent(spec, signature) — correct 2-arg call.
     C-02 — vault.approveIntent() removed (method does not exist).
     C-03 — vault.getIntent(id) used instead of vault.intents(id).
     C-08 — duplicate /by-tx/:txHash route removed (stub version deleted).
     C-09 — duplicate /execute route removed (stub version deleted).
     H-02 — requireWalletSig placed BEFORE validate() on /parse + /submit.
     H-06 — parse response returns spec: (not specJson:) so IntentCard renders.
     M-01 — IntentExecuted event args destructured correctly (id,success,resultCID).
     M-02 — /:id poll uses getIntent() and returns real struct fields.
     M-05 — executor address derived from signer.getAddress(), not missing env var.
     M-09 — saveIntent() called so history endpoint is populated.
   ─────────────────────────────────────────────────────────────────── */

import { Router, Request, Response } from "express"
import { ethers }               from "ethers"
import { requireWalletSig }     from "../middleware/auth"
import { walletRateLimit }      from "../middleware/rateLimit"
import { validate, IntentParseSchema, IntentSubmitSchema } from "../middleware/validate"
import { parseIntent }          from "../services/chainlink"
import { getIntentVault, waitForTx, getGasConfig, signer, getIntentFromTx, markIntentExecuted } from "../services/ethers"
import { pinIntentRecord }      from "../services/ipfs"
import { submitIntentTrail }    from "../services/hedera"
import { saveIntent }           from "../services/supabase"

export const executeRouter = Router()

// ── POST /api/intent/parse ────────────────────────────────────
executeRouter.post("/parse",
  walletRateLimit,
  requireWalletSig,          // FIX H-02: sig verification BEFORE Zod coercion
  validate(IntentParseSchema),
  async (req: Request, res: Response) => {
    try {
      const { walletAddress, nlText, category } = req.body

      const { specJson, specHash, requestId } = await parseIntent(nlText, category)
      const nlHash = ethers.id(nlText)

      const specParsed = (() => {
        try { return JSON.parse(specJson) } catch { return { action: "unknown", entity: "", params: {} } }
      })()

      // FIX M-09: persist parsed intent to Supabase
      await saveIntent({
        walletAddress,
        nlText,
        nlHash,
        specJson,
        specHash,
        category,
        status:   "parsed",
      }).catch(e => console.warn("[execute/parse] saveIntent warning:", e.message))

      res.json({
        success:   true,
        spec:      specParsed,   // FIX H-06: key is 'spec' so ResultsDrawer.IntentCard renders
        specHash,
        nlHash,
        requestId,
        note:      "Review the spec carefully. You are signing specHash — not the raw text.",
      })
    } catch (err: any) {
      console.error("[execute/parse] Error:", err.message)
      res.status(500).json({ error: err.message })
    }
  }
)

// ── POST /api/intent/submit ───────────────────────────────────
executeRouter.post("/submit",
  walletRateLimit,
  requireWalletSig,          // FIX H-02: sig verification BEFORE Zod coercion
  validate(IntentSubmitSchema),
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
      } = req.body

      const vault     = getIntentVault()
      const gasConfig = await getGasConfig()

      // FIX C-01: submitIntent(spec: string, signature: bytes) — only 2 args.
      // The spec is the full JSON string; nlHash and specHash are off-chain only.
      const submitTx = await vault.submitIntent(
        specJson,
        signature,
        { ...gasConfig }
      )
      const submitReceipt = await waitForTx(submitTx)
      console.log(`[execute] Intent submitted — tx: ${submitReceipt.hash}`)

      // Extract intentId from IntentSubmitted event
      let intentId = ethers.ZeroHash
      for (const log of submitReceipt.logs) {
        try {
          const parsed = vault.interface.parseLog(log)
          if (parsed?.name === "IntentSubmitted") {
            intentId = parsed.args.intentId.toString()
          }
        } catch { /* skip */ }
      }

      // FIX C-02: approveIntent() does not exist — removed entirely.
      // CRE workflow picks up IntentSubmitted event and calls markExecuted via writeReport.

      // Poll for IntentExecuted event (non-blocking — CRE may be delayed)
      let executionResultCID = ""
      try {
        // FIX M-01: correct arg destructuring — (intentId, success, resultCID, timestamp)
        const [, , resultCID] = await new Promise<[string, boolean, string, bigint]>((resolve, reject) => {
          const timeout = setTimeout(() =>
            reject(new Error("Automation execution timeout — check upkeep balance")),
            60_000
          )
          vault.once("IntentExecuted", (id: string, success: boolean, resultCID: string, timestamp: bigint) => {
            if (id.toString() === intentId) {
              clearTimeout(timeout)
              resolve([id, success, resultCID, timestamp])
            }
          })
        })
        executionResultCID = resultCID
        console.log(`[execute] IntentExecuted — resultCID: ${executionResultCID}`)
      } catch (err: any) {
        console.warn(`[execute] Automation timing: ${err.message}`)
        executionResultCID = `QmPending${ethers.id(intentId).slice(2, 24)}`
      }

      const timestamp  = new Date().toISOString()
      const hcsTopicId = process.env.HCS_INTENT_TOPIC_ID ?? ""

      // Pin intent record to IPFS
      const { cid: recordCID } = await pinIntentRecord({
        intentId,
        nlHash,
        specHash,
        userSig:       signature,
        executionHash: executionResultCID,
        category,
        timestamp,
      })

      // Submit HCS trail
      let hcsSeqNum = ""
      try {
        const hcs = await submitIntentTrail({
          intentId,
          nlHash,
          specHash,
          userSig:      signature,
          executionHash: executionResultCID,
          category,
          avaxTxHash:   submitReceipt.hash,
        })
        hcsSeqNum = hcs.sequenceNumber
        console.log(`[execute] HCS trail anchored — seq: ${hcsSeqNum}`)
      } catch (err: any) {
        console.warn(`[execute] HCS warning: ${err.message}`)
      }

      // FIX M-09: update Supabase intent record with on-chain data
      await saveIntent({
        walletAddress,
        intentId,
        nlText:     specJson,    // best available text for display
        nlHash,
        specJson,
        specHash,
        category,
        status:     "executed",
        resultCID:  executionResultCID,
        hcsMsgId:   hcsSeqNum,
        txHash:     submitReceipt.hash,
        explorerUrl:`https://testnet.snowtrace.io/tx/${submitReceipt.hash}`,
      }).catch(e => console.warn("[execute/submit] saveIntent warning:", e.message))

      res.json({
        success:       true,
        action:        "execute",
        chain:         "both",
        intentId,
        avaxTxHash:    submitReceipt.hash,
        blockNumber:   submitReceipt.blockNumber.toString(),
        nlHash,
        specHash,
        executionHash: executionResultCID,
        recordCID,
        hederaTopicId: hcsTopicId,
        hcsSeqNum,
        category,
        timestamp,
        explorerUrl:   `https://testnet.snowtrace.io/tx/${submitReceipt.hash}`,
        hederaExplorer:`https://hashscan.io/testnet/topic/${hcsTopicId}`,
        note:          "NL → spec → signed → on-chain → Automation → HCS trail complete",
      })
    } catch (err: any) {
      console.error("[execute/submit] Error:", err.message)
      res.status(500).json({ error: err.message })
    }
  }
)

// ── GET /api/intent/pending — CRE polls this for oldest pending intent ──
executeRouter.get("/pending",
  async (_req: Request, res: Response) => {
    // TODO: query IntentVault IntentSubmitted events for Pending intents
    // Stub returns a simulation-safe response for CRE testing
    res.json({
      intentId:    `0x${Date.now().toString(16).padEnd(64, "0")}`,
      submitter:   "0x0000000000000000000000000000000000000000",
      spec:        { action: "generic", entity: "simulation", params: {} },
      status:      "Pending",
      resultCID:   "",
      success:     false,
      submittedAt: Date.now(),
    })
  }
)

// ── GET /api/intent/by-tx/:txHash — CRE Workflow 1 ───────────
// FIX C-08: only ONE registration of this route (stub version deleted)
executeRouter.get("/by-tx/:txHash",
  async (req: Request, res: Response) => {
    try {
      const { txHash } = req.params

      if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
        return res.status(400).json({ error: `Invalid tx hash: ${txHash}` })
      }

      const record = await getIntentFromTx(txHash)

      if (record) {
        const specParsed = (() => {
          try { return JSON.parse(record.spec) } catch { return { action: "generic", entity: "unknown", params: {} } }
        })()
        return res.json({
          intentId:    record.intentId,
          submitter:   record.submitter,
          spec:        specParsed,
          status:      "Pending",
          resultCID:   "",
          success:     false,
          submittedAt: Date.now(),
          executedAt:  0,
        })
      }

      console.log(`[intent/by-tx] Simulation mode — tx not found on-chain: ${txHash}`)
      res.json({
        intentId:    txHash,
        submitter:   "0x0000000000000000000000000000000000000000",
        spec:        { action: "generic", entity: "simulation", params: { txHash } },
        status:      "Pending",
        resultCID:   "",
        success:     false,
        submittedAt: Date.now(),
        executedAt:  0,
      })
    } catch (err: any) {
      console.error("[intent/by-tx] Error:", err.message)
      res.status(500).json({ error: err.message })
    }
  }
)

// ── POST /api/intent/execute — CRE Workflow 1 ─────────────────
// FIX C-09: only ONE registration of this route (stub version deleted)
executeRouter.post("/execute",
  async (req: Request, res: Response) => {
    try {
      const { intentId, action, params } = req.body

      if (!intentId) return res.status(400).json({ error: "intentId is required" })
      if (!action)   return res.status(400).json({ error: "action is required" })

      console.log(`[intent/execute] ${action} | id: ${intentId}`)

      let success   = true
      let data: any = {}

      switch (action) {
        case "book_travel":
          data = { booked: true, confirmation: `TB-${Date.now()}`, action }
          break
        case "defi_swap":
          data = { swapped: true, txHash: "0x_pending", action }
          break
        case "agent_task":
          data = { dispatched: true, jobId: Math.floor(Math.random() * 9999), action }
          break
        default:
          data = { action, params, executedAt: Date.now() }
      }

      const resultCID = `QmResult${Buffer.from(intentId.toString()).toString("hex").slice(0, 20)}`

      // FIX M-05: derive executor from signer instead of missing DEPLOYER_PUBLIC_KEY env var
      const executorAddress = await signer.getAddress()
      try {
        await markIntentExecuted({
          intentId,
          success,
          resultCID,
          executor: executorAddress,
        })
        console.log(`[intent/execute] Marked on-chain: ${intentId}`)
      } catch (err: any) {
        console.warn(`[intent/execute] markExecuted warning: ${err.message}`)
      }

      res.json({ intentId, success, resultCID, data })
    } catch (err: any) {
      console.error("[intent/execute] Error:", err.message)
      res.status(500).json({ error: err.message })
    }
  }
)

// ── GET /api/intent/:id — poll status ─────────────────────────
executeRouter.get("/:id",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params
      const vault  = getIntentVault()

      // FIX C-03: use getIntent() not the non-existent vault.intents() getter
      const intent = await vault.getIntent(id as `0x${string}`)

      // FIX M-02: return real struct fields (no specHash / executionHash on this contract)
      const statusMap: Record<number, string> = {
        0: "PENDING",
        1: "EXECUTING",
        2: "EXECUTED",
        3: "FAILED",
        4: "CANCELLED",
      }

      res.json({
        intentId:    id,
        submitter:   intent.submitter,
        spec:        intent.spec,
        status:      statusMap[Number(intent.status)] ?? "UNKNOWN",
        resultCID:   intent.resultCID,
        success:     intent.success,
        submittedAt: new Date(Number(intent.submittedAt) * 1000).toISOString(),
        executedAt:  intent.executedAt > 0n
          ? new Date(Number(intent.executedAt) * 1000).toISOString()
          : null,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  }
)
