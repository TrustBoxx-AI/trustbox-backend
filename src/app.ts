/* app.ts — TrustBox Backend */

import express        from "express"
import cors           from "cors"
import { env }        from "./config/env"
import { apiLimiter } from "./middleware/rateLimit"

import { verifyRouter }     from "./api/verify"
import { auditRouter }      from "./api/audit"
import { scanRouter }       from "./api/scan"
import { scoreRouter }      from "./api/score"
import { blindAuditRouter } from "./api/blindaudit"
import { executeRouter }    from "./api/execute"
import { agentsRouter }     from "./api/agents"
import { proofRouter }      from "./api/proof"
import { teeRouter }        from "./api/tee"
import { authRouter }       from "./api/auth"
import { historyRouter }    from "./api/history"

const app = express()

// ── Security headers ──────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("X-XSS-Protection", "1; mode=block")
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  next()
})

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      env.FRONTEND_ORIGIN,
      "http://localhost:5173",
      "https://trustbox-ai.vercel.app",
    ]
    // Allow requests with no origin (mobile apps, curl, Render health checks)
    if (!origin || allowed.includes(origin)) return callback(null, true)
    callback(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
  methods:     ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","x-wallet-address","x-signature"],
}))

// ── Body parsing ──────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true }))

// ── Global rate limit ─────────────────────────────────────────
app.use("/api", apiLimiter)

// ── Health ────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status:    "ok",
    version:   "1.0.0",
    timestamp: new Date().toISOString(),
    env:       env.NODE_ENV,
  })
})

// ── Routes ────────────────────────────────────────────────────
app.use("/api/auth",      authRouter)
app.use("/api/history",   historyRouter)
app.use("/api/verify",    verifyRouter)
app.use("/api/audit",     auditRouter)
app.use("/api/scan",      scanRouter)
app.use("/api/score",     scoreRouter)
app.use("/api/blindaudit",blindAuditRouter)
app.use("/api/intent",    executeRouter)
app.use("/api/agents",    agentsRouter)
app.use("/api/proof",     proofRouter)
app.use("/api/tee",       teeRouter)

// ── 404 ───────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" })
})

// ── Error handler ─────────────────────────────────────────────
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[server] Unhandled error:", err.message)
  res.status(500).json({ error: "Internal server error" })
})

export default app