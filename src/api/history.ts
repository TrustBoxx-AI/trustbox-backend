/* api/history.ts — TrustBox
   GET /api/history/dashboard     — full dashboard summary
   GET /api/history/scores        — credit score history
   GET /api/history/audits        — audit history
   GET /api/history/intents       — intent history
   GET /api/history/agents        — agent NFTs
   GET /api/history/notifications — notifications
   POST /api/history/notifications/read — mark all read
   ──────────────────────────────────────────────────────── */

import { Router, Request, Response } from "express"
import { requireAuth }               from "../middleware/auth"
import {
  getDashboard, getScoreHistory, getAuditHistory,
  getBlindAuditHistory, getIntentHistory, getAgentNFTs,
  getNotifications, markNotificationsRead,
} from "../services/supabase"

export const historyRouter = Router()

// All history routes require JWT auth
historyRouter.use(requireAuth)

// ── GET /api/history/dashboard ────────────────────────────────
historyRouter.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress
    const data   = await getDashboard(wallet)
    res.json({ ok: true, ...data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/history/scores ───────────────────────────────────
historyRouter.get("/scores", async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress
    const limit  = Math.min(Number(req.query.limit ?? 10), 50)
    const data   = await getScoreHistory(wallet, limit)
    res.json({ ok: true, scores: data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/history/audits ───────────────────────────────────
historyRouter.get("/audits", async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress
    const limit  = Math.min(Number(req.query.limit ?? 20), 100)
    const [regular, blind] = await Promise.all([
      getAuditHistory(wallet, limit),
      getBlindAuditHistory(wallet, limit),
    ])
    res.json({ ok: true, audits: regular, blindAudits: blind })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/history/intents ──────────────────────────────────
historyRouter.get("/intents", async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress
    const limit  = Math.min(Number(req.query.limit ?? 20), 100)
    const data   = await getIntentHistory(wallet, limit)
    res.json({ ok: true, intents: data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/history/agents ───────────────────────────────────
historyRouter.get("/agents", async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress
    const data   = await getAgentNFTs(wallet)
    res.json({ ok: true, agents: data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/history/notifications ───────────────────────────
historyRouter.get("/notifications", async (req: Request, res: Response) => {
  try {
    const wallet     = (req as any).walletAddress
    const unreadOnly = req.query.unread === "true"
    const data       = await getNotifications(wallet, unreadOnly)
    res.json({ ok: true, notifications: data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/history/notifications/read ─────────────────────
historyRouter.post("/notifications/read", async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress
    await markNotificationsRead(wallet)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})