/* middleware/rateLimit.ts — TrustBox
   Per-wallet-address rate limiting.
   10 requests / minute per address.
   ─────────────────────────────────── */

import rateLimit from "express-rate-limit";
import { Request } from "express";

export const walletRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max:      10,
  keyGenerator: (req: Request) => {
    // Key on wallet address if present, else IP
    const body = req.body as any;
    return (body?.walletAddress ?? req.ip ?? "unknown").toLowerCase();
  },
  message:  { error: "Too many requests — max 10 per minute per wallet address" },
  standardHeaders: true,
  legacyHeaders:   false,
});
