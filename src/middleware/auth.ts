/* middleware/auth.ts — TrustBox
   requireWalletSig — verifies EIP-191 signature on request body
   requireAuth      — verifies JWT from Authorization header
   optionalAuth     — attaches wallet if token present, continues if not

   NOTE: apiLimiter and walletRateLimit are defined solely in
   middleware/rateLimit.ts. They are NOT exported from here to
   avoid the duplicate-export shadowing bug (H-01).
   ────────────────────────────────────────────────────────────── */

import { Request, Response, NextFunction } from "express"
import { ethers }                          from "ethers"
import jwt                                 from "jsonwebtoken"
import { env }                             from "../config/env"
import { validateSession }                 from "../services/supabase"

// ── EIP-191 wallet signature verification ─────────────────────
// IMPORTANT: this middleware must be placed BEFORE validate(Schema)
// in the middleware chain so it hashes the original raw body, not
// the Zod-coerced version. (Fixes H-02 / H-03 / H-04)
export function requireWalletSig(req: Request, res: Response, next: NextFunction) {
  // ── Dev/testnet bypass ─────────────────────────────────────
  // Set NODE_ENV=development in Render environment to enable.
  // Attaches walletAddress from body so downstream handlers work.
  if (process.env.NODE_ENV === "development") {
    ;(req as any).walletAddress = (req.body?.walletAddress ?? "").toLowerCase()
    return next()
  }

  // ── Production: verify EIP-191 signature ──────────────────
  const signature    = req.header("x-wallet-signature") as string
  const walletHeader = req.header("x-wallet-address")   as string

  if (!signature || !walletHeader) {
    return res.status(401).json({ error: "Wallet signature required" })
  }

  try {
    const message   = JSON.stringify(req.body)
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
  const authHeader = req.header("authorization")
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
  const token = req.header("authorization")?.replace("Bearer ", "")
  if (!token) return next()

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as any
    ;(req as any).walletAddress = payload.sub
  } catch { /* ignore */ }

  next()
}