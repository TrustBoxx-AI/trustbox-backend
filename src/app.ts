/* app.ts — TrustBox Backend
   Express 5 app. All routes wired here.
   Import this in server.ts for the HTTP server.
   ─────────────────────────────────────────────────────── */

import express from "express";
import cors    from "cors";
import helmet  from "helmet";
import { env } from "./config/env";
import { apiLimiter } from "./middleware/rateLimit";

// ── Route handlers ───────────────────────────────────────────────
import { verifyRouter }    from "./api/verify";
import { auditRouter }     from "./api/audit";
import { scanRouter }      from "./api/scan";
import { scoreRouter }     from "./api/score";
import { blindAuditRouter }from "./api/blindaudit";
import { executeRouter }   from "./api/execute";
import { agentsRouter }    from "./api/agents";
import { proofRouter }     from "./api/proof";

const app = express();

// ── Security headers ─────────────────────────────────────────────
app.use(helmet());

// ── CORS — allow frontend origin ─────────────────────────────────
app.use(cors({
  origin:      env.FRONTEND_ORIGIN,
  methods:     ["GET", "POST"],
  allowedHeaders: ["Content-Type", "x-wallet-signature"],
}));

// ── Body parser ───────────────────────────────────────────────────
app.use(express.json({ limit: "2mb" })); // 2MB max — for IPFS CIDs, not raw files

// ── Global rate limit ─────────────────────────────────────────────
app.use("/api", apiLimiter);

// ── Health check ──────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    ok:      true,
    service: "trustbox-backend",
    version: "1.0.0",
    env:     env.NODE_ENV,
    time:    new Date().toISOString(),
  });
});

// ── Routes ────────────────────────────────────────────────────────
//   POST /api/verify        — ERC-8004 agent credential mint
//   POST /api/audit         — AuditRegistry.sol anchor
//   POST /api/scan          — behavioural analysis (no chain)
//   POST /api/score         — ZK proof verify + Hedera HCS + HTS
//   POST /api/blindaudit    — Phala TEE dispatch
//   POST /api/intent/parse  — NL → spec via Chainlink Functions
//   POST /api/intent/submit — sign + submit + Automation
//   GET  /api/intent/:id    — poll intent status
//   GET  /api/agents        — agent marketplace list
//   GET  /api/proof/:action/:id — fetch proof by action + id

app.use("/api/verify",     verifyRouter);
app.use("/api/audit",      auditRouter);
app.use("/api/scan",       scanRouter);
app.use("/api/score",      scoreRouter);
app.use("/api/blindaudit", blindAuditRouter);
app.use("/api/intent",     executeRouter);
app.use("/api/agents",     agentsRouter);
app.use("/api/proof",      proofRouter);

// ── 404 handler ───────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ ok: false, code: "NOT_FOUND", message: "Route not found" });
});

// ── Global error handler ──────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[App Error]", err);
  res.status(500).json({
    ok:      false,
    code:    "INTERNAL_ERROR",
    message: env.NODE_ENV === "development" ? err.message : "Internal server error",
  });
});

export default app;
