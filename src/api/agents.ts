/* api/agents.ts — TrustBox
   GET /api/agents — on-chain agent list hydrated with metadata
   ─────────────────────────────────────────────────────────── */

import { Router, Request, Response } from "express";
import { getAgentMarketplace } from "../services/ethers";
import { fetchJSON }           from "../services/ipfs";

export const agentsRouter = Router();

// Simple in-memory cache — 60 second TTL
let _cache: { data: object[]; expiresAt: number } | null = null;

agentsRouter.get("/",
  async (_req: Request, res: Response) => {
    try {
      // Serve from cache if fresh
      if (_cache && Date.now() < _cache.expiresAt) {
        return res.json({ agents: _cache.data, cached: true });
      }

      const marketplace = getAgentMarketplace();
      const count       = await marketplace.agentCount();
      const agents      = [];

      for (let i = 0; i < Number(count); i++) {
        try {
          const agent = await marketplace.getAgentByIndex(i);
          // Hydrate with IPFS metadata if available
          let metadata = {};
          try {
            if (agent.metaURI?.startsWith("ipfs://")) {
              metadata = await fetchJSON(agent.metaURI.replace("ipfs://", ""));
            }
          } catch { /* metadata fetch is non-fatal */ }

          agents.push({ ...agent, ...metadata });
        } catch { /* skip malformed agents */ }
      }

      _cache = { data: agents, expiresAt: Date.now() + 60_000 };
      res.json({ agents, cached: false });
    } catch (err: any) {
      // Fallback to seed data if contract not yet deployed
      console.warn("[agents] Contract not available, returning seed data:", err.message);
      const { SEED_AGENTS } = await import("../config/seedAgents");
      res.json({ agents: SEED_AGENTS, cached: false, note: "seed data — deploy AgentMarketplace.sol" });
    }
  }
);
