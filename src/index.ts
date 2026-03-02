/* index.ts — TrustBox Backend
   Express 4 server. Stateless orchestration layer.
   All state lives on-chain or in IPFS — server holds nothing.
   ─────────────────────────────────────────────────────────── */

import express         from "express";
import cors            from "cors";
import { env }         from "./config/env";
import { verifyRouter }    from "./api/verify";
import { auditRouter }     from "./api/audit";
import { scanRouter }      from "./api/scan";
import { scoreRouter }     from "./api/score";
import { blindAuditRouter }from "./api/blindaudit";
import { executeRouter }   from "./api/execute";
import { agentsRouter }    from "./api/agents";

const app = express();

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin:      env.FRONTEND_ORIGIN,
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Health ────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status:    "ok",
    version:   "1.0.0",
    timestamp: new Date().toISOString(),
    env:       env.NODE_ENV,
  });
});

// ── Routes ────────────────────────────────────────────────────
app.use("/api/verify",     verifyRouter);
app.use("/api/audit",      auditRouter);
app.use("/api/scan",       scanRouter);
app.use("/api/score",      scoreRouter);
app.use("/api/blindaudit", blindAuditRouter);
app.use("/api/intent",     executeRouter);
app.use("/api/agents",     agentsRouter);

// ── 404 handler ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Global error handler ─────────────────────────────────────
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[server] Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────
const PORT = Number(env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`\n🚀  TrustBox backend running on port ${PORT}`);
  console.log(`   Frontend origin:  ${env.FRONTEND_ORIGIN}`);
  console.log(`   Environment:      ${env.NODE_ENV}`);
  console.log(`   Avalanche RPC:    ${env.AVALANCHE_FUJI_RPC}`);
  console.log(`\n   Endpoints:`);
  console.log(`   POST  /api/verify     — ERC-8004 agent credential mint`);
  console.log(`   POST  /api/audit      — smart contract audit + anchor`);
  console.log(`   POST  /api/scan       — behavioural analysis`);
  console.log(`   POST  /api/score      — ZK credit score + Hedera HCS`);
  console.log(`   POST  /api/blindaudit — Phala TEE blind audit`);
  console.log(`   POST  /api/intent/parse   — NL → spec (Chainlink Functions)`);
  console.log(`   POST  /api/intent/submit  — spec + sig → IntentVault + HCS`);
  console.log(`   GET   /api/intent/:id     — poll intent status`);
  console.log(`   GET   /api/agents         — marketplace agent list\n`);
});

export default app;
