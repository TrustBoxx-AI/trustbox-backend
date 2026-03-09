

import { Router, Request, Response } from "express"
import { ethers }                     from "ethers"
import jwt                            from "jsonwebtoken"
import { env }                        from "../config/env"
import { requireAuth }                from "../middleware/auth"

export const authRouter = Router()

const JWT_TTL_SEC  = 60 * 60 * 24 * 7   // 7 days
const JWT_TTL_MS   = JWT_TTL_SEC * 1000

function makeToken(walletAddress: string): { token: string; expiresAt: string } {
  const expiresAt = new Date(Date.now() + JWT_TTL_MS).toISOString()
  const token     = jwt.sign(
    { sub: walletAddress.toLowerCase(), wallet: walletAddress.toLowerCase() },
    env.JWT_SECRET,
    { expiresIn: JWT_TTL_SEC }
  )
  return { token, expiresAt }
}

// ── POST /api/auth/login ──────────────────────────────────────
// Body: { walletAddress, signature, message }
// Verifies EIP-191 signature, issues JWT.
authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const { walletAddress, signature, message } = req.body

    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return res.status(400).json({ error: "walletAddress must be a valid EVM address" })
    }
    if (!signature || !message) {
      return res.status(400).json({ error: "signature and message are required" })
    }

    // Verify the wallet signed exactly this message
    const recovered = ethers.verifyMessage(message, signature).toLowerCase()
    if (recovered !== walletAddress.toLowerCase()) {
      return res.status(401).json({ error: "Signature verification failed" })
    }

    const { token, expiresAt } = makeToken(walletAddress)

    console.log(`[auth] Login — wallet: ${walletAddress.slice(0, 10)}…`)

    res.json({
      ok: true,
      token,
      expiresAt,
      user: {
        id:             walletAddress.toLowerCase(),
        wallet_address: walletAddress.toLowerCase(),
        created_at:     new Date().toISOString(),
        last_seen:      new Date().toISOString(),
      },
    })
  } catch (err: any) {
    console.error("[auth/login]", err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/auth/me ──────────────────────────────────────────
authRouter.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress as string

    res.json({
      user: {
        id:             wallet,
        wallet_address: wallet,
        created_at:     new Date().toISOString(),
        last_seen:      new Date().toISOString(),
      },
      dashboard: {
        latestScore:  null,
        latestBand:   null,
        auditCount:   0,
        intentCount:  0,
        agentCount:   0,
        unreadCount:  0,
        lastActivity: null,
      },
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/auth/logout ─────────────────────────────────────
// JWTs are stateless — client removes the token; backend just acknowledges.
authRouter.post("/logout", (_req: Request, res: Response) => {
  res.json({ ok: true })
})

// ── POST /api/auth/refresh ────────────────────────────────────
authRouter.post("/refresh", requireAuth, (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress as string
    const { token, expiresAt } = makeToken(wallet)
    res.json({ ok: true, token, expiresAt })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})
