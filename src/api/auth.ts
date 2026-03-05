/* api/auth.ts — TrustBox
   POST /api/auth/login    — verify wallet sig → JWT + Supabase session
   POST /api/auth/logout   — revoke session
   GET  /api/auth/me       — get user profile + dashboard
   POST /api/auth/refresh  — refresh JWT
   ────────────────────────────────────────────────────────────── */

import { Router, Request, Response } from "express"
import { ethers }                    from "ethers"
import * as jwt                      from "jsonwebtoken"
import { v4 as uuidv4 }             from "uuid"
import { env }                       from "../config/env"
import {
  upsertUser, createSession, validateSession,
  revokeSession, getDashboard, getUser,
} from "../services/supabase"

export const authRouter = Router()

const JWT_SECRET  = env.JWT_SECRET
const JWT_EXPIRES = "7d"

// ── POST /api/auth/login ──────────────────────────────────────
authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const { walletAddress, signature, message } = req.body

    if (!walletAddress || !signature || !message) {
      return res.status(400).json({ error: "walletAddress, signature, message required" })
    }

    // 1. Verify signature
    let recovered: string
    try {
      recovered = ethers.verifyMessage(message, signature).toLowerCase()
    } catch {
      return res.status(401).json({ error: "Invalid signature" })
    }

    if (recovered !== walletAddress.toLowerCase()) {
      return res.status(401).json({ error: "Signature mismatch" })
    }

    // 2. Validate message format (replay protection)
    // Message must contain wallet address and a timestamp within 5 minutes
    if (!message.includes(walletAddress.toLowerCase()) && !message.includes(walletAddress)) {
      return res.status(401).json({ error: "Invalid login message" })
    }

    // 3. Upsert user in Supabase
    const user = await upsertUser(walletAddress)

    // 4. Issue JWT
    const jti     = uuidv4()
    const payload = {
      sub: walletAddress.toLowerCase(),
      jti,
      iat: Math.floor(Date.now() / 1000),
    }

    const token     = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES })
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    // 5. Store session in Supabase
    await createSession(walletAddress, jti, expiresAt)

    res.json({
      ok:      true,
      token,
      user,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (err: any) {
    console.error("[auth/login] Error:", err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/auth/logout ─────────────────────────────────────
authRouter.post("/logout", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "")
    if (token) {
      const decoded = jwt.decode(token) as any
      if (decoded?.jti) await revokeSession(decoded.jti)
    }
    res.json({ ok: true })
  } catch {
    res.json({ ok: true })
  }
})

// ── GET /api/auth/me ──────────────────────────────────────────
authRouter.get("/me", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "")
    if (!token) return res.status(401).json({ error: "No token" })

    let payload: any
    try {
      payload = jwt.verify(token, JWT_SECRET)
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" })
    }

    // Validate session not revoked
    const valid = await validateSession(payload.jti)
    if (!valid) return res.status(401).json({ error: "Session revoked or expired" })

    const [user, dashboard] = await Promise.all([
      getUser(payload.sub),
      getDashboard(payload.sub),
    ])

    res.json({ ok: true, user, dashboard })
  } catch (err: any) {
    console.error("[auth/me] Error:", err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/auth/refresh ────────────────────────────────────
authRouter.post("/refresh", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "")
    if (!token) return res.status(401).json({ error: "No token" })

    let payload: any
    try {
      payload = jwt.verify(token, JWT_SECRET)
    } catch {
      return res.status(401).json({ error: "Invalid token" })
    }

    const valid = await validateSession(payload.jti)
    if (!valid) return res.status(401).json({ error: "Session revoked" })

    // Revoke old session
    await revokeSession(payload.jti)

    // Issue new JWT
    const jti       = uuidv4()
    const newToken  = jwt.sign({ sub: payload.sub, jti }, JWT_SECRET, { expiresIn: JWT_EXPIRES })
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await createSession(payload.sub, jti, expiresAt)

    res.json({ ok: true, token: newToken, expiresAt: expiresAt.toISOString() })
  } catch (err: any) {
    console.error("[auth/refresh] Error:", err.message)
    res.status(500).json({ error: err.message })
  }
})