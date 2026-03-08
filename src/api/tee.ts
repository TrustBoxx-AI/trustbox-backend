/* api/tee.ts — TrustBox
   POST /api/tee/probe-and-update — Phala TEE liveness + trust score update
   Called by CRE Workflow 3 every 2 hours to scan active agents.
   ─────────────────────────────────────────────────────────────────────── */

import { Router, Request, Response } from "express";

export const teeRouter = Router();

// ── POST /api/tee/probe-and-update — CRE Workflow 3 ──────────
teeRouter.post("/probe-and-update",
  async (req: Request, res: Response) => {
    try {
      const { agentId, tokenId, teeEndpoint, contractAddr } = req.body

      if (!agentId)     return res.status(400).json({ error: "agentId is required" })
      if (!teeEndpoint) return res.status(400).json({ error: "teeEndpoint is required" })

      console.log(`[tee/probe] Probing ${agentId} at ${teeEndpoint}`)

      // TODO: real Phala TEE probe
      // 1. POST challenge to teeEndpoint
      // 2. Verify attestation signature
      // 3. Compute behaviourChecksum

      // Stub: simulate liveness (90% uptime)
      const liveness   = Math.random() > 0.1
      const trustDelta = liveness ? Math.floor(Math.random() * 3) : -5

      // TODO: read current score from TrustRegistry contract
      const currentScore = 75
      const newScore     = Math.min(100, Math.max(0, currentScore + trustDelta))
      const changed      = newScore !== currentScore

      res.json({
        agentId,
        tokenId,
        liveness,
        behaviourChecksum: `0x${Buffer.from(`cs_${agentId}_${Date.now()}`).toString("hex").slice(0, 64)}`,
        newScore,
        changed,
        attestation: liveness ? `attest_${agentId}_ok` : null,
      })
    } catch (err: any) {
      console.error("[tee/probe] Error:", err.message)
      res.status(500).json({ error: err.message })
    }
  }
)

// ── POST /api/tee/submit-audit — Frontend ─────────────────────
teeRouter.post("/submit-audit",
  async (req: Request, res: Response) => {
    try {
      const { contractAddr, agentId, agentOperator } = req.body

      if (!contractAddr)  return res.status(400).json({ error: "contractAddr is required" })
      if (!agentId)       return res.status(400).json({ error: "agentId is required" })

      console.log(`[tee/submit-audit] ${contractAddr} → agent ${agentId}`)

      // TODO: encrypt payload + call AgentMarketplace.createJob
      res.json({
        success:   true,
        jobId:     Math.floor(Math.random() * 10000),
        agentId,
        txHash:    "0x_pending",
        createdAt: Date.now(),
      })
    } catch (err: any) {
      console.error("[tee/submit-audit] Error:", err.message)
      res.status(500).json({ error: err.message })
    }
  }
)