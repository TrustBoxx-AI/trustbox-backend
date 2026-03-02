/* middleware/auth.ts — TrustBox
   Wallet signature verification on every mutating request.
   The request body must include walletAddress + the x-signature
   header containing ethers.signMessage(SHA256(body)).
   ─────────────────────────────────────────────────────── */

import { Request, Response, NextFunction } from "express";
import { ethers } from "ethers";
import { z } from "zod";

// Every authenticated request body must have walletAddress
const AuthBodySchema = z.object({
  walletAddress: z.string().startsWith("0x").length(42),
});

export function requireWalletSig(req: Request, res: Response, next: NextFunction) {
  const sig = req.headers["x-signature"] as string | undefined;

  if (!sig) {
    return res.status(401).json({ error: "Missing x-signature header" });
  }

  const parsed = AuthBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Missing walletAddress in request body" });
  }

  try {
    // Verify: signer must be walletAddress
    const bodyStr  = JSON.stringify(req.body);
    const msgHash  = ethers.id(bodyStr); // keccak256 of the body string
    const recovered = ethers.verifyMessage(msgHash, sig);

    if (recovered.toLowerCase() !== parsed.data.walletAddress.toLowerCase()) {
      return res.status(401).json({ error: "Signature does not match walletAddress" });
    }

    // Attach to request for downstream use
    (req as any).verifiedAddress = recovered.toLowerCase();
    next();
  } catch {
    return res.status(401).json({ error: "Invalid signature" });
  }
}
