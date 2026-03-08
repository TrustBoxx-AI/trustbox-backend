/* index.ts — TrustBox Backend
   Express 4 server. Stateless orchestration layer.
   All state lives on-chain or in IPFS — server holds nothing.
   ─────────────────────────────────────────────────────────── */

import express          from "express";
import cors             from "cors";
import { env }          from "./config/env";
import { verifyRouter }     from "./api/verify";
import { auditRouter }      from "./api/audit";
import { scanRouter }       from "./api/scan";
import { scoreRouter }      from "./api/score";
import { blindAuditRouter } from "./api/blindaudit";
import { executeRouter }    from "./api/execute";
import { agentsRouter }     from "./api/agents";
import { proofRouter }      from "./api/proof";
import { teeRouter }        from "./api/tee";
import { chatRouter }       from "./api/chat";
import { priceRouter }      from "./api/price";

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
app.use("/api/proof",      proofRouter);
app.use("/api/tee",        teeRouter);       // ← CRE Workflow 3
app.use("/api/agent",      chatRouter);      // ← HOL HCS-10 chat
app.use("/api/price",       priceRouter);     // ← CRE Workflow 4 Tenderly price feeds

// ── 404 handler ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Global error handler ──────────────────────────────────────
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[server] Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────
const PORT = Number(env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`\n🚀  TrustBox backend running on port ${PORT}`);
  console.log(`   Environment:  ${env.NODE_ENV}`);
  console.log(`\n   Core endpoints:`);
  console.log(`   POST  /api/verify`);
  console.log(`   POST  /api/audit`);
  console.log(`   POST  /api/score`);
  console.log(`   POST  /api/blindaudit`);
  console.log(`   POST  /api/intent/parse`);
  console.log(`   POST  /api/intent/submit`);
  console.log(`   GET   /api/agents`);
  console.log(`\n   CRE workflow endpoints:`);
  console.log(`   GET   /api/intent/by-tx/:txHash`);
  console.log(`   POST  /api/intent/execute`);
  console.log(`   GET   /api/score/pending`);
  console.log(`   POST  /api/score/compute-and-anchor`);
  console.log(`   GET   /api/agents/active`);
  console.log(`   POST  /api/tee/probe-and-update\n`);
});

export default app;