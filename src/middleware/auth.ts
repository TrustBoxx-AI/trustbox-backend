/* middleware/auth.ts — TrustBox (UPDATED)
   requireWalletSig — verifies EIP-191 signature on request body
   requireAuth      — verifies JWT from Authorization header
   apiLimiter       — rate limiter export
   ────────────────────────────────────────────────────────────── */

import { Request, Response, NextFunction } from "express"
import { ethers }                          from "ethers"
import jwt                            from "jsonwebtoken"
import rateLimit                           from "express-rate-limit"
import { env }                             from "../config/env"
import { validateSession }                 from "../services/supabase"

// ── API Rate limiter ──────────────────────────────────────────
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max:      100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Too many requests — try again later" },
})

export const walletRateLimit = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max:      10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Rate limit exceeded" },
})

// ── EIP-191 wallet signature verification ─────────────────────
export function requireWalletSig(req: Request, res: Response, next: NextFunction) {
  const signature    = req.headers["x-wallet-signature"] as string
  const walletHeader = req.headers["x-wallet-address"]   as string

  if (!signature || !walletHeader) {
    return res.status(401).json({ error: "Wallet signature required" })
  }

  try {
    const message  = JSON.stringify(req.body)
    const recovered = ethers.verifyMessage(message, signature).toLowerCase()

    if (recovered !== walletHeader.toLowerCase()) {
      return res.status(401).json({ error: "Signature verification failed" })
    }

    ;(req as any).walletAddress = recovered
    next()
  } catch (err: any) {
    return res.status(401).json({ error: `Signature error: ${err.message}` })
  }
}

// ── JWT auth (for history + protected routes) ─────────────────
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization header required" })
  }

  const token = authHeader.replace("Bearer ", "")

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as any

    // Async session validation — non-blocking
    validateSession(payload.jti).then(valid => {
      if (!valid) {
        res.status(401).json({ error: "Session expired or revoked" })
        return
      }
      ;(req as any).walletAddress = payload.sub
      ;(req as any).jti           = payload.jti
      next()
    }).catch(() => {
      // If Supabase is down, fall back to JWT-only validation
      ;(req as any).walletAddress = payload.sub
      ;(req as any).jti           = payload.jti
      next()
    })
  } catch (err: any) {
    return res.status(401).json({ error: "Invalid or expired token" })
  }
}

// ── Optional auth — attaches wallet if token present ─────────
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "")
  if (!token) return next()

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as any
    ;(req as any).walletAddress = payload.sub
  } catch { /* ignore */ }

  next()
}