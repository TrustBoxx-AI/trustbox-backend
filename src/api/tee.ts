/* api/tee.ts — TrustBox
   POST /api/tee/probe-and-update  — CRE Workflow 3: TEE liveness + trust score
   POST /api/tee/submit-audit      — Frontend: dispatch blind audit job
   GET  /api/tee/job/:jobId        — Poll audit job result
   ─────────────────────────────────────────────────────────────────────────── */

import { Router, Request, Response } from "express"
import { probeTEEAgent, computeTrustDelta, dispatchTEEJob, encryptForAgent, getAgentPublicKey } from "../services/phala"
import { updateAgentScore, getAgentRecord, getAgentMarketplace, waitForTx, getGasConfig } from "../services/ethers"
import { ethers } from "ethers"

export const teeRouter = Router()

// ── In-memory probe history (per agent, last 10 probes) ───────
const probeHistory: Map<string, { liveness: boolean; timestamp: string }[]> = new Map()

function addProbeHistory(agentId: string, liveness: boolean) {
  const history = probeHistory.get(agentId) ?? []
  history.push({ liveness, timestamp: new Date().toISOString() })
  if (history.length > 10) history.shift()
  probeHistory.set(agentId, history)
}

// ── POST /api/tee/probe-and-update — CRE Workflow 3 ──────────
teeRouter.post("/probe-and-update",
  async (req: Request, res: Response) => {
    try {
      const { agentId, tokenId, teeEndpoint, contractAddr } = req.body

      if (!agentId)     return res.status(400).json({ error: "agentId is required" })
      if (!teeEndpoint) return res.status(400).json({ error: "teeEndpoint is required" })

      console.log(`[tee/probe] Probing ${agentId} at ${teeEndpoint}`)

      // 1. Probe the TEE agent
      const probe = await probeTEEAgent({ agentId, teeEndpoint })
      addProbeHistory(agentId, probe.liveness)

      // 2. Read current score from TrustRegistry
      let currentScore = 75  // fallback
      if (tokenId) {
        try {
          const record = await getAgentRecord(Number(tokenId))
          currentScore = Number(record.trustScore ?? record.score ?? 75)
        } catch (err: any) {
          console.warn(`[tee/probe] Could not read score for tokenId ${tokenId}: ${err.message}`)
        }
      }

      // 3. Compute new score
      const history = probeHistory.get(agentId) ?? []
      const { newScore, delta, changed } = computeTrustDelta(currentScore, probe, history)

      // 4. Update score on-chain if changed
      if (changed && tokenId) {
        try {
          const reason = probe.liveness ? "TEE liveness probe passed" : "TEE liveness probe failed"
          await updateAgentScore(Number(tokenId), newScore, reason)
          console.log(`[tee/probe] Score updated on-chain: ${agentId} ${currentScore} → ${newScore}`)
        } catch (err: any) {
          console.warn(`[tee/probe] Score update warning: ${err.message}`)
        }
      }

      res.json({
        agentId,
        tokenId,
        liveness:          probe.liveness,
        behaviourChecksum: probe.behaviourChecksum,
        currentScore,
        newScore,
        delta,
        changed,
        attestation: probe.attestation,
        probedAt:    probe.timestamp,
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
      const { contractAddr, agentId, agentOperator, requester, auditScope } = req.body

      if (!contractAddr)  return res.status(400).json({ error: "contractAddr is required" })
      if (!agentId)       return res.status(400).json({ error: "agentId is required" })
      if (!agentOperator) return res.status(400).json({ error: "agentOperator is required" })

      console.log(`[tee/audit] ${contractAddr} → agent ${agentId}`)

      // 1. Build audit payload
      const payload = {
        contractAddr,
        auditScope: auditScope ?? ["static-analysis", "reentrancy", "access-control"],
        requestedAt: new Date().toISOString(),
        requester:   requester ?? "anonymous",
      }

      // 2. Encrypt payload with agent's public key
      let encryptedPayload = ""
      let payloadHash      = ethers.id(JSON.stringify(payload))

      try {
        const agentPubKey = await getAgentPublicKey(agentId)
        encryptedPayload  = await encryptForAgent(payload, agentPubKey)
      } catch (err: any) {
        console.warn(`[tee/audit] Could not encrypt payload: ${err.message} — using dev mode`)
        encryptedPayload = Buffer.from(JSON.stringify(payload)).toString("base64")
      }

      // 3. Dispatch job via AgentMarketplace.createJob()
      const marketplace = getAgentMarketplace()
      const gasConfig   = await getGasConfig()

      const jobId = Math.floor(Math.random() * 99999)  // temp — replaced by contract event

      try {
        const tx = await marketplace.createJob(
          agentId,
          agentOperator,
          encryptedPayload,
          payloadHash,
          { ...gasConfig }
        )
        const receipt = await waitForTx(tx)

        // Extract real jobId from JobCreated event
        for (const log of receipt.logs) {
          try {
            const parsed = marketplace.interface.parseLog(log)
            if (parsed?.name === "JobCreated") {
              return res.json({
                success:   true,
                jobId:     parsed.args.jobId.toString(),
                agentId,
                txHash:    receipt.hash,
                createdAt: Date.now(),
              })
            }
          } catch { /* skip */ }
        }

        res.json({ success: true, jobId, agentId, txHash: receipt.hash, createdAt: Date.now() })
      } catch (err: any) {
        // Contract not wired yet — return stub
        console.warn(`[tee/audit] Contract call warning: ${err.message}`)
        res.json({ success: true, jobId, agentId, txHash: "0x_pending", createdAt: Date.now() })
      }
    } catch (err: any) {
      console.error("[tee/audit] Error:", err.message)
      res.status(500).json({ error: err.message })
    }
  }
)

// ── GET /api/tee/job/:jobId — Poll result ─────────────────────
teeRouter.get("/job/:jobId",
  async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId)
      if (isNaN(jobId)) return res.status(400).json({ error: "Invalid jobId" })

      const marketplace = getAgentMarketplace()

      try {
        const job = await marketplace.getJob(BigInt(jobId))
        res.json({
          jobId,
          status:     ["Open", "Assigned", "Completed", "Disputed", "Resolved"][Number(job.status)] ?? "Unknown",
          resultCID:  job.resultCID  || null,
          resultHash: job.resultHash || null,
          agentId:    job.agentId,
          createdAt:  Number(job.createdAt) * 1000,
          expiresAt:  Number(job.expiresAt) * 1000,
        })
      } catch (err: any) {
        // Contract not wired yet
        res.json({ jobId, status: "Open", resultCID: null, resultHash: null })
      }
    } catch (err: any) {
      console.error("[tee/job] Error:", err.message)
      res.status(500).json({ error: err.message })
    }
  }
)