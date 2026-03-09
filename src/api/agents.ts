

import { Router, Request, Response } from "express";
import { ethers }                     from "ethers";
import { getAgentMarketplace, getGasConfig, signer } from "../services/ethers";
import { validate, AgentRegisterSchema } from "../middleware/validate";

export const agentsRouter = Router();

// Minimum stake required by contract: 0.01 AVAX
const MIN_STAKE_WEI = ethers.parseEther("0.01");

// Simple in-memory cache — 60s TTL
let _cache: { data: any[]; expiresAt: number } | null = null;

// ── GET /api/agents ───────────────────────────────────────────
agentsRouter.get("/", async (_req: Request, res: Response) => {
  try {
    if (_cache && Date.now() < _cache.expiresAt) {
      return res.json({ agents: _cache.data, cached: true });
    }

    const marketplace  = getAgentMarketplace();
    const operatorKeys = await marketplace.getOperatorAgents(await signer.getAddress());
    const agents: any[] = [];

    for (const key of operatorKeys) {
      try {
        // getAgent requires (agentId, operator) — we need to decode the key
        // Key = keccak256(agentId ++ operator) — not reversible, so we filter events
        // Fallback: use AgentRegistered events to get agentId + operator pairs
      } catch { /* skip */ }
    }

    // Primary approach: query AgentRegistered events to get all (agentId, operator) pairs
    try {
      const filter  = marketplace.filters.AgentRegistered();
      const events  = await marketplace.queryFilter(filter, -10000);

      for (const evt of events) {
        try {
          const { agentId, operator, teeEndpoint, stake } = (evt as any).args;
          const agent = await marketplace.getAgent(agentId, operator);
          agents.push({
            id:          agentId,
            operator,
            teeEndpoint: agent.teeEndpoint,
            stake:       agent.stake?.toString() ?? "0",
            status:      agent.status === 0n ? "active"
                       : agent.status === 1n ? "suspended"
                       : "slashed",
            jobsCompleted: Number(agent.jobsCompleted ?? 0),
            jobsFailed:    Number(agent.jobsFailed    ?? 0),
            tokenId:       Number(agent.tokenId       ?? 0),
            registeredAt:  Number(agent.registeredAt  ?? 0) * 1000,
          });
        } catch { /* skip malformed */ }
      }
    } catch (evtErr: any) {
      console.warn("[agents] Event query failed:", evtErr.message);
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
    const { agentId, operator } = req.body;
    if (!agentId)   return res.status(400).json({ error: "agentId required" });
    if (!operator)  return res.status(400).json({ error: "operator address required" });
    if (!ethers.isAddress(operator)) {
      return res.status(400).json({ error: "operator must be a valid EVM address" });
    }

    const marketplace = getAgentMarketplace();
    let agent: any;

    try {
      agent = await marketplace.getAgent(agentId, operator);
    } catch (e: any) {
      return res.status(404).json({ error: `Agent not found: ${agentId} / ${operator}` });
    }

    const isActive = agent.status === 0n; // AgentStatus.Active = 0
    if (!isActive) {
      return res.status(400).json({ error: "Agent is not active" });
    }

    res.json({
      ok:            true,
      agentId,
      operator,
      teeEndpoint:   agent.teeEndpoint,
      stake:         agent.stake?.toString() ?? "0",
      jobsCompleted: Number(agent.jobsCompleted ?? 0),
      status:        "hired",
      message:       `Agent ${agentId} is ready — submit a blind audit job to deploy`,
    });
  } catch (err: any) {
    console.error("[agents] hire error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agents/register ─────────────────────────────────
// Contract: registerAgent(agentId, teeEndpoint, encPubKey) payable
// Caller: backend signer (DEPLOYER_PRIVATE_KEY) — operators must use direct
//         contract call for production; this endpoint is a dev/demo helper.
agentsRouter.post("/register",
  validate(AgentRegisterSchema),
  async (req: Request, res: Response) => {
    try {
      const { agentId, teeEndpoint, encPubKey, stakeAmount } = req.body;

      // Build 65-byte uncompressed pubkey — use stub for demo if not provided
      let pubKeyBytes: Uint8Array;
      if (encPubKey && encPubKey.startsWith("0x") && encPubKey.length === 132) {
        // Valid 65-byte hex (0x + 130 hex chars)
        pubKeyBytes = ethers.getBytes(encPubKey);
      } else {
        // Stub: deterministic 65-byte key from agentId (demo only)
        const hash = ethers.keccak256(ethers.toUtf8Bytes(`pubkey:${agentId}`));
        // Pad to 65 bytes: 0x04 prefix (uncompressed) + 32 bytes x + 32 bytes y
        pubKeyBytes = new Uint8Array(65);
        pubKeyBytes[0] = 0x04; // uncompressed prefix
        const hashBytes = ethers.getBytes(hash);
        pubKeyBytes.set(hashBytes, 1);        // fill x (32 bytes)
        pubKeyBytes.set(hashBytes, 33);       // fill y (32 bytes, same — valid for demo)
      }

      const stakeWei  = stakeAmount ? BigInt(stakeAmount) : MIN_STAKE_WEI;
      const gasConfig = await getGasConfig();

      const marketplace = getAgentMarketplace();
      const tx = await marketplace.registerAgent(
        agentId,
        teeEndpoint,
        pubKeyBytes,
        { ...gasConfig, value: stakeWei }
      );

      const receipt = await tx.wait(1);
      _cache = null; // invalidate agent list cache

      console.log(`[agents] Registered ${agentId} — tx: ${receipt.hash}`);

      res.json({
        ok:          true,
        agentId,
        teeEndpoint,
        txHash:      receipt.hash,
        stake:       stakeWei.toString(),
        explorerUrl: `https://testnet.snowtrace.io/tx/${receipt.hash}`,
      });
    } catch (err: any) {
      console.error("[agents] register error:", err.message);

      // Surface contract revert messages clearly
      const msg = err.reason ?? err.shortMessage ?? err.message ?? "Unknown error";

      if (msg.includes("already registered")) {
        return res.status(409).json({ error: "Agent already registered with this operator" });
      }
      if (msg.includes("insufficient stake")) {
        return res.status(400).json({ error: `Insufficient stake — minimum is 0.01 AVAX (${MIN_STAKE_WEI} wei)` });
      }
      if (msg.includes("empty endpoint")) {
        return res.status(400).json({ error: "teeEndpoint cannot be empty" });
      }
      if (msg.includes("invalid pubkey")) {
        return res.status(400).json({ error: "encPubKey must be a 65-byte uncompressed public key" });
      }

      res.status(500).json({ error: msg });
    }
  }
);
