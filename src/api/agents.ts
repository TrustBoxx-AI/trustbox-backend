/* api/agents.ts — TrustBox (FULL REPLACEMENT)
   GET  /api/agents         — paginated agent list (contract + seed fallback)
   GET  /api/agents/active  — CRE Workflow 3: active agents with TEE endpoints
   POST /api/agents/register — register new agent (mint NFT + marketplace)
   GET  /api/agents/:agentId — single agent details
   ─────────────────────────────────────────────────────────────────────────── */

import { Router, Request, Response } from "express"
import { ethers }                    from "ethers"
import { getTrustRegistry, getAgentMarketplace, waitForTx, getGasConfig } from "../services/ethers"
import { fetchJSON }                 from "../services/ipfs"
import { SEED_AGENTS }               from "../config/seedAgents"

export const agentsRouter = Router()

// ── In-memory cache — 60s TTL ─────────────────────────────────
let _cache: { data: object[]; expiresAt: number } | null = null

function invalidateCache() { _cache = null }

// ── GET /api/agents — full agent list ────────────────────────
agentsRouter.get("/",
  async (_req: Request, res: Response) => {
    try {
      if (_cache && Date.now() < _cache.expiresAt) {
        return res.json({ agents: _cache.data, cached: true })
      }

      try {
        const marketplace = getAgentMarketplace()
        const count       = await marketplace.agentCount()
        const agents      = []

        for (let i = 0; i < Number(count); i++) {
          try {
            const agent    = await marketplace.getAgentByIndex(i)
            let metadata   = {}
            try {
              if (agent.metaURI?.startsWith("ipfs://")) {
                metadata = await fetchJSON(agent.metaURI.replace("ipfs://", ""))
              }
            } catch { /* metadata fetch is non-fatal */ }
            agents.push({ ...agent, ...metadata })
          } catch { /* skip malformed agents */ }
        }

        if (agents.length > 0) {
          _cache = { data: agents, expiresAt: Date.now() + 60_000 }
          return res.json({ agents, cached: false })
        }
        // Fall through to seed data if contract returns empty
        throw new Error("no agents in contract")
      } catch {
        // Fallback to seed data
        _cache = { data: SEED_AGENTS, expiresAt: Date.now() + 60_000 }
        return res.json({ agents: SEED_AGENTS, cached: false, note: "seed data" })
      }
    } catch (err: any) {
      console.error("[agents] Error:", err.message)
      res.status(500).json({ error: err.message })
    }
  }
)

// ── GET /api/agents/active — CRE Workflow 3 ──────────────────
agentsRouter.get("/active",
  async (_req: Request, res: Response) => {
    try {
      // Try contract first
      try {
        const marketplace = getAgentMarketplace()
        const count       = await marketplace.agentCount()

        if (Number(count) > 0) {
          const active = []
          for (let i = 0; i < Number(count); i++) {
            try {
              const agent = await marketplace.getAgentByIndex(i)
              if (agent.status === 0) {  // 0 = Active
                active.push({
                  agentId:     agent.agentId,
                  tokenId:     Number(agent.tokenId),
                  teeEndpoint: agent.teeEndpoint,
                  operator:    agent.operator,
                  stake:       ethers.formatEther(agent.stake),
                  score:       Number(agent.trustScore ?? 75),
                })
              }
            } catch { /* skip */ }
          }
          if (active.length > 0) return res.json(active)
        }
        throw new Error("no active agents in contract")
      } catch {
        // Fallback to seed agents
        const active = SEED_AGENTS
          .filter(a => a.status === "online")
          .map((a, i) => ({
            agentId:     a.id,
            tokenId:     i + 1,
            teeEndpoint: `https://phat.phala.network/contracts/get/${a.id}`,
            operator:    "0x494F52322eA822E35Cf9D05fF801e00Fc26AEa5F",
            stake:       a.stake,
            score:       a.avgScore,
          }))
        return res.json(active)
      }
    } catch (err: any) {
      console.error("[agents/active] Error:", err.message)
      res.status(500).json({ error: err.message })
    }
  }
)

// ── POST /api/agents/register — mint NFT + register ──────────
agentsRouter.post("/register",
  async (req: Request, res: Response) => {
    try {
      const { agentId, teeEndpoint, encPubKey, operator, stake } = req.body

      if (!agentId)     return res.status(400).json({ error: "agentId is required" })
      if (!teeEndpoint) return res.status(400).json({ error: "teeEndpoint is required" })
      if (!operator)    return res.status(400).json({ error: "operator is required" })

      console.log(`[agents/register] Registering ${agentId} for ${operator}`)

      const marketplace = getAgentMarketplace()
      const registry    = getTrustRegistry()
      const gasConfig   = await getGasConfig()

      // 1. Mint ERC-8004 credential in TrustRegistry
      const modelHash  = ethers.id(`${agentId}:${teeEndpoint}`)
      const capHash    = ethers.id("tee-agent")
      const stakeValue = ethers.parseEther(stake ?? "0.1")

      const registerTx = await marketplace.registerAgent(
        agentId,
        teeEndpoint,
        encPubKey ?? ethers.ZeroHash,
        { value: stakeValue, ...gasConfig }
      )

      const receipt = await waitForTx(registerTx)
      invalidateCache()

      let tokenId = "0"
      for (const log of receipt.logs) {
        try {
          const parsed = marketplace.interface.parseLog(log)
          if (parsed?.name === "AgentRegistered") {
            tokenId = parsed.args.tokenId?.toString() ?? "0"
          }
        } catch { /* skip */ }
      }

      console.log(`[agents/register] Registered: ${agentId} tokenId: ${tokenId}`)

      res.json({
        success:      true,
        agentId,
        tokenId,
        txHash:       receipt.hash,
        blockNumber:  receipt.blockNumber.toString(),
        registeredAt: Date.now(),
        explorerUrl:  `https://testnet.snowtrace.io/tx/${receipt.hash}`,
      })
    } catch (err: any) {
      console.error("[agents/register] Error:", err.message)
      res.status(500).json({ error: err.message })
    }
  }
)

// ── GET /api/agents/:agentId — single agent ───────────────────
agentsRouter.get("/:agentId",
  async (req: Request, res: Response) => {
    try {
      const { agentId } = req.params

      // Try contract
      try {
        const marketplace = getAgentMarketplace()
        const agent       = await marketplace.getAgent(agentId)

        let metadata = {}
        try {
          if (agent.metaURI?.startsWith("ipfs://")) {
            metadata = await fetchJSON(agent.metaURI.replace("ipfs://", ""))
          }
        } catch { /* non-fatal */ }

        return res.json({ ...agent, ...metadata })
      } catch {
        // Fallback to seed data
        const seed = SEED_AGENTS.find(a => a.id === agentId)
        if (seed) return res.json(seed)
        return res.status(404).json({ error: `Agent not found: ${agentId}` })
      }
    } catch (err: any) {
      console.error("[agents/:agentId] Error:", err.message)
      res.status(500).json({ error: err.message })
    }
  }
)