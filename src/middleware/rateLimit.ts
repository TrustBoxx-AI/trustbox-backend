/* middleware/rateLimit.ts — TrustBox
   Per-wallet + global rate limiting.
   ─────────────────────────────────── */

import rateLimit from "express-rate-limit";
import { Request } from "express";

// ── Per-wallet rate limit (write endpoints) ───────────────────
export const walletRateLimit = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max:      10,
  keyGenerator: (req: Request) => {
    const body = req.body as any;
    return (body?.walletAddress ?? req.ip ?? "unknown").toLowerCase();
  },
  message:         { error: "Too many requests — max 10 per minute per wallet address" },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Global API rate limit (all /api/* routes) ─────────────────
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max:      100,
  message:  { error: "Too many requests — max 100 per 15 minutes" },
  standardHeaders: true,
  legacyHeaders:   false,
});