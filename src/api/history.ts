/* api/history.ts — TrustBox
   GET  /api/history/dashboard              — full dashboard summary
   GET  /api/history/scores                 — credit score history
   GET  /api/history/audits                 — audit history
   GET  /api/history/intents                — intent history
   GET  /api/history/agents                 — agent NFTs
   GET  /api/history/notifications          — notifications
   POST /api/history/notifications/read     — mark all read
   ── Write endpoints called by frontend after each action ──────
   POST /api/history/scores                 — record score result
   POST /api/history/audits                 — record audit result
   POST /api/history/blindaudits            — record blind audit
   POST /api/history/agents                 — record agent NFT mint
   POST /api/history/intents                — record intent execution
   ──────────────────────────────────────────────────────────── */

import { Router, Request, Response } from "express"
import { requireAuth }               from "../middleware/auth"
import { createClient }              from "@supabase/supabase-js"
import {
  getDashboard, getScoreHistory, getAuditHistory,
  getBlindAuditHistory, getIntentHistory, getAgentNFTs,
  getNotifications, markNotificationsRead,
} from "../services/supabase"

// ── Supabase service-role client (bypasses RLS) ───────────────
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function addNotification(wallet: string, type: string, title: string, message: string) {
  await supabase.from("notifications").insert({
    wallet_address: wallet, type, title, message,
    read: false, created_at: new Date().toISOString(),
  })
}

export const historyRouter = Router()

// All routes require auth
historyRouter.use(requireAuth)

// ── GET /api/history/dashboard ────────────────────────────────
historyRouter.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress
    const data   = await getDashboard(wallet)
    res.json({ ok: true, ...data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/history/scores ───────────────────────────────────
historyRouter.get("/scores", async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress
    const limit  = Math.min(Number(req.query.limit ?? 10), 50)
    const data   = await getScoreHistory(wallet, limit)
    res.json({ ok: true, scores: data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/history/scores ──────────────────────────────────
historyRouter.post("/scores", async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress
    const { scoreBand, scoreLabel, proof, hcsTopicId, hcsTxId, zkProofHash } = req.body

    const { data, error } = await supabase
      .from("credit_scores")
      .insert({
        wallet_address: wallet,
        score_band:     scoreBand,
        score_label:    scoreLabel ?? null,
        proof:          proof ?? null,
        hcs_topic_id:   hcsTopicId ?? null,
        hcs_tx_id:      hcsTxId ?? null,
        zk_proof_hash:  zkProofHash ?? null,
        created_at:     new Date().toISOString(),
      })
      .select().single()

    if (error) throw new Error(error.message)

    await addNotification(wallet, "score", "Credit Score Computed",
      `Your AI credit score: Band ${scoreBand} — ${scoreLabel}`)

    res.json({ ok: true, record: data })
  } catch (err: any) {
    console.error("[history] score write:", err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/history/audits ───────────────────────────────────
historyRouter.get("/audits", async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress
    const limit  = Math.min(Number(req.query.limit ?? 20), 100)
    const [regular, blind] = await Promise.all([
      getAuditHistory(wallet, limit),
      getBlindAuditHistory(wallet, limit),
    ])
    res.json({ ok: true, audits: regular, blindAudits: blind })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/history/audits ──────────────────────────────────
historyRouter.post("/audits", async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress
    const { contractAddress, contractName, auditId, reportCID, merkleRoot, score, txHash, explorerUrl } = req.body

    const { data, error } = await supabase
      .from("audits")
      .insert({
        wallet_address:   wallet,
        contract_address: contractAddress,
        contract_name:    contractName ?? null,
        audit_id:         auditId ?? null,
        report_cid:       reportCID ?? null,
        merkle_root:      merkleRoot ?? null,
        score:            score ?? null,
        tx_hash:          txHash ?? null,
        explorer_url:     explorerUrl ?? null,
        status:           "anchored",
        created_at:       new Date().toISOString(),
      })
      .select().single()

    if (error) throw new Error(error.message)

    await addNotification(wallet, "audit", "Audit Anchored",
      `Audit for ${contractName ?? contractAddress?.slice(0, 10)} anchored on-chain`)

    res.json({ ok: true, record: data })
  } catch (err: any) {
    console.error("[history] audit write:", err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/history/blindaudits ─────────────────────────────
historyRouter.post("/blindaudits", async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress
    const { agentId, bundleCID, resultCID, jobId, attestation, txHash, explorerUrl } = req.body

    const { data, error } = await supabase
      .from("blind_audits")
      .insert({
        wallet_address: wallet,
        agent_id:       agentId ?? null,
        bundle_cid:     bundleCID ?? null,
        result_cid:     resultCID ?? null,
        job_id:         jobId ?? null,
        attestation:    attestation ?? null,
        tx_hash:        txHash ?? null,
        explorer_url:   explorerUrl ?? null,
        status:         "complete",
        created_at:     new Date().toISOString(),
      })
      .select().single()

    if (error) throw new Error(error.message)

    await addNotification(wallet, "audit", "Blind Audit Complete",
      `TEE blind audit by agent ${agentId} completed`)

    res.json({ ok: true, record: data })
  } catch (err: any) {
    console.error("[history] blindaudit write:", err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/history/intents ──────────────────────────────────
historyRouter.get("/intents", async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress
    const limit  = Math.min(Number(req.query.limit ?? 20), 100)
    const data   = await getIntentHistory(wallet, limit)
    res.json({ ok: true, intents: data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/history/intents ─────────────────────────────────
historyRouter.post("/intents", async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress
    const { nlText, specJson, specHash, category, intentId, txHash, explorerUrl } = req.body

    const { data, error } = await supabase
      .from("intents")
      .insert({
        wallet_address: wallet,
        nl_text:        nlText ?? null,
        spec_json:      specJson ?? null,
        spec_hash:      specHash ?? null,
        category:       category ?? null,
        intent_id:      intentId ?? null,
        tx_hash:        txHash ?? null,
        explorer_url:   explorerUrl ?? null,
        status:         "executed",
        created_at:     new Date().toISOString(),
      })
      .select().single()

    if (error) throw new Error(error.message)

    await addNotification(wallet, "intent", "Intent Executed",
      nlText?.slice(0, 80) ?? "Intent executed on-chain")

    res.json({ ok: true, record: data })
  } catch (err: any) {
    console.error("[history] intent write:", err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/history/agents ───────────────────────────────────
historyRouter.get("/agents", async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress
    const data   = await getAgentNFTs(wallet)
    res.json({ ok: true, agents: data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/history/agents ──────────────────────────────────
historyRouter.post("/agents", async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress
    const { agentId, tokenId, modelHash, metadataURI, metadataCID, txHash, explorerUrl } = req.body

    const { data, error } = await supabase
      .from("agent_nfts")
      .insert({
        wallet_address: wallet,
        agent_id:       agentId ?? null,
        token_id:       tokenId ?? null,
        model_hash:     modelHash ?? null,
        metadata_uri:   metadataURI ?? null,
        metadata_cid:   metadataCID ?? null,
        tx_hash:        txHash ?? null,
        explorer_url:   explorerUrl ?? null,
        created_at:     new Date().toISOString(),
      })
      .select().single()

    if (error) throw new Error(error.message)

    await addNotification(wallet, "agent", "Agent NFT Minted",
      `ERC-8004 credential minted for agent ${agentId} — Token #${tokenId}`)

    res.json({ ok: true, record: data })
  } catch (err: any) {
    console.error("[history] agent write:", err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/history/notifications ───────────────────────────
historyRouter.get("/notifications", async (req: Request, res: Response) => {
  try {
    const wallet     = (req as any).walletAddress
    const unreadOnly = req.query.unread === "true"
    const data       = await getNotifications(wallet, unreadOnly)
    res.json({ ok: true, notifications: data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/history/notifications/read ─────────────────────
historyRouter.post("/notifications/read", async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress
    await markNotificationsRead(wallet)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})