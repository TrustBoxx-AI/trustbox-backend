/* middleware/validate.ts — TrustBox
   Zod request body validators for all 6 endpoints.
   Fields that require multi-step client-side work (ZK proofs,
   encrypted bundles) are optional so the demo/testnet flow works
   without the full pre-processing pipeline.
   ─────────────────────────────────────────────────────────── */

import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error:  "Validation failed",
        issues: result.error.issues.map(i => ({
          field:   i.path.join("."),
          message: i.message,
        })),
      });
    }
    req.body = result.data;
    next();
  };
}

// ── Schemas ───────────────────────────────────────────────────

export const VerifySchema = z.object({
  walletAddress: z.string().startsWith("0x").length(42),
  agentName:     z.string().min(1).max(100),
  model:         z.string().min(1).max(100).default("gpt-4o"),
  operator:      z.string().min(1).max(100).default("TrustBox Demo"),
  capabilities:  z.string().default("Audit, Verification"),
  // Optional — defaults to "development" so testnet demos work without
  // an explicit environment selection in the frontend form.
  environment:   z.enum(["production", "staging", "development"]).default("development"),
});

export const AuditSchema = z.object({
  walletAddress:   z.string().startsWith("0x").length(42),
  contractName:    z.string().min(1).max(100),
  contractAddress: z.string().startsWith("0x").length(42),
  chain:           z.string().default("avalanche-fuji"),
  abiSource:       z.string().optional(),
  deployer:        z.string().optional(),
});

export const ScanSchema = z.object({
  walletAddress: z.string().startsWith("0x").length(42).optional(),
  entityType:    z.string().default("security-agent"),
  entityName:    z.string().min(1).max(100),
  data:          z.record(z.unknown()).default({}),
});

export const ScoreSchema = z.object({
  walletAddress:   z.string().startsWith("0x").length(42),
  // hederaAccountId is optional so the form works without a Hedera wallet
  hederaAccountId: z.string().optional().default(""),
  // proof and publicSignals are optional — when absent the endpoint
  // returns a demo/simulated score instead of verifying a real ZK proof.
  proof:           z.object({}).optional(),
  publicSignals:   z.array(z.string()).optional(),
  modelVersion:    z.string().default("TrustCredit v2.1"),
});

export const BlindAuditSchema = z.object({
  walletAddress:      z.string().startsWith("0x").length(42),
  projectName:        z.string().min(1).max(100),
  agentId:            z.string(),
  // Optional — client should pin the encrypted bundle first; if absent
  // the backend uses a stub CID so the demo flow still completes.
  encryptedBundleCID: z.string().optional().default("QmStubEncryptedBundle"),
  auditScope:         z.array(z.string()).optional(),
  notes:              z.string().optional(),
});

export const IntentParseSchema = z.object({
  walletAddress: z.string().startsWith("0x").length(42),
  nlText:        z.string().min(5).max(2000),
  category:      z.enum(["Travel Booking", "Portfolio Rebalance", "Contributor Tip"]).default("Travel Booking"),
});

export const IntentSubmitSchema = z.object({
  walletAddress:   z.string().startsWith("0x").length(42),
  hederaAccountId: z.string().optional().default(""),
  nlHash:          z.string().startsWith("0x"),
  specHash:        z.string().startsWith("0x"),
  specJson:        z.string(),
  category:        z.enum(["Travel Booking", "Portfolio Rebalance", "Contributor Tip"]).default("Travel Booking"),
  signature:       z.string().startsWith("0x"),
});