/* api/agents.ts — TrustBox
   GET  /api/agents        — list all agents (on-chain + seed fallback)
   POST /api/agents/hire   — hire an agent (add to job queue)
   POST /api/agents/register — register a new agent on-chain
   ─────────────────────────────────────────────────────────── */

import { Router, Request, Response } from "express";
import { getAgentMarketplace }        from "../services/ethers";

export const agentsRouter = Router();

// Simple in-memory cache — 60s TTL
let _cache: { data: any[]; expiresAt: number } | null = null;

// ── GET /api/agents ───────────────────────────────────────────
agentsRouter.get("/", async (_req: Request, res: Response) => {
  try {
    if (_cache && Date.now() < _cache.expiresAt) {
      return res.json({ agents: _cache.data, cached: true });
    }

    const marketplace = getAgentMarketplace();

    // getActiveAgents() returns string[] of agentIds
    const agentIds: string[] = await marketplace.getActiveAgents();
    const agents: any[] = [];

    for (const agentId of agentIds) {
      try {
        const a = await marketplace.getAgent(agentId);
        agents.push({
          id:           a.agentId,
          name:         a.name,
          operator:     a.operator,
          teeEndpoint:  a.teeEndpoint,
          stakeAmount:  a.stakeAmount?.toString() ?? "0",
          trustScore:   Number(a.trustScore),
          isSlashed:    a.isSlashed,
          status:       a.isSlashed ? "offline" : a.isActive ? "online" : "offline",
          capabilities: [],
          auditCount:   0,
          model:        "TEE Agent",
          version:      "1.0",
        });
      } catch { /* skip malformed */ }
    }

    _cache = { data: agents, expiresAt: Date.now() + 60_000 };
    res.json({ agents, cached: false });

  } catch (err: any) {
    // Fallback to seed data if contract unavailable
    console.warn("[agents] Contract unavailable, using seed data:", err.message);
    const { SEED_AGENTS } = await import("../config/seedAgents");
    res.json({ agents: SEED_AGENTS, cached: false, seed: true });
  }
});

// ── POST /api/agents/hire ─────────────────────────────────────
agentsRouter.post("/hire", async (req: Request, res: Response) => {
  try {
    const { agentId, requesterAddress, bundleCID } = req.body;
    if (!agentId) return res.status(400).json({ error: "agentId required" });

    const marketplace = getAgentMarketplace();

    // Verify agent exists and is active
    const agent = await marketplace.getAgent(agentId);
    if (!agent.isActive || agent.isSlashed) {
      return res.status(400).json({ error: "Agent is not available" });
    }

    res.json({
      ok:          true,
      agentId,
      agentName:   agent.name,
      operator:    agent.operator,
      teeEndpoint: agent.teeEndpoint,
      trustScore:  Number(agent.trustScore),
      status:      "hired",
      message:     `Agent ${agent.name} is ready — submit a blind audit job to deploy`,
    });
  } catch (err: any) {
    console.error("[agents] hire error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agents/register ─────────────────────────────────
agentsRouter.post("/register", async (req: Request, res: Response) => {
  try {
    const { agentId, name, teeEndpoint, stakeAmount } = req.body;
    if (!agentId || !name) return res.status(400).json({ error: "agentId and name required" });

    const marketplace  = getAgentMarketplace();
    const { getGasConfig } = await import("../services/ethers");
    const gasConfig    = await getGasConfig();
    const stakeWei     = BigInt(stakeAmount ?? 0);

    const tx = await marketplace.registerAgent(
      agentId, name, teeEndpoint ?? "", stakeWei,
      { ...gasConfig, value: stakeWei }
    );
    const receipt = await tx.wait(1);

    _cache = null; // invalidate cache

    res.json({
      ok:          true,
      agentId,
      name,
      txHash:      receipt.hash,
      explorerUrl: `https://testnet.snowtrace.io/tx/${receipt.hash}`,
    });
  } catch (err: any) {
    console.error("[agents] register error:", err.message);
    res.status(500).json({ error: err.message });
  }
});