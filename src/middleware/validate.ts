/* middleware/validate.ts — TrustBox */

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

// ── Step 1: prepare (compute hashes + pin metadata, no mint) ──
export const VerifySchema = z.object({
  walletAddress: z.string().startsWith("0x").length(42),
  agentName:     z.string().min(1).max(100),
  model:         z.string().min(1).max(100),
  operator:      z.string().min(1).max(100),
  capabilities:  z.string(),
  environment:   z.enum(["production","staging","development"]).default("development"),
});

// ── Step 2: mint (human approved + signed) ────────────────────
export const VerifyMintSchema = z.object({
  walletAddress:     z.string().startsWith("0x").length(42),
  agentId:           z.string(),
  modelHash:         z.string().startsWith("0x"),
  capHash:           z.string().startsWith("0x"),
  metadataURI:       z.string(),
  approvalMessage:   z.string(),
  approvalSignature: z.string().startsWith("0x"),
  trustScore:        z.number().optional(),
});

export const AuditSchema = z.object({
  walletAddress:   z.string().startsWith("0x").length(42),
  contractName:    z.string().min(1).max(100),
  contractAddress: z.string().startsWith("0x").length(42),
  chain:           z.string(),
  abiSource:       z.string().optional(),
  deployer:        z.string().optional(),
});

export const ScanSchema = z.object({
  walletAddress: z.string().startsWith("0x").length(42).optional(),
  entityType:    z.string(),
  entityName:    z.string().min(1).max(100),
  data:          z.record(z.unknown()),
});

export const ScoreSchema = z.object({
  walletAddress:   z.string().startsWith("0x").length(42),
  hederaAccountId: z.string().optional().default(""),
  proof:           z.object({}).passthrough().optional(),
  publicSignals:   z.array(z.string()).optional().default([]),
  modelVersion:    z.string().default("TrustCredit v2.1"),
});

export const BlindAuditSchema = z.object({
  walletAddress:      z.string().startsWith("0x").length(42),
  projectName:        z.string().min(1).max(100),
  agentId:            z.string(),
  encryptedBundleCID: z.string().optional().default("QmStubBundle"),
  auditScope:         z.array(z.string()).optional(),
  notes:              z.string().optional(),
});

export const IntentParseSchema = z.object({
  walletAddress: z.string().startsWith("0x").length(42),
  nlText:        z.string().min(5).max(2000),
  category:      z.enum(["Travel Booking","Portfolio Rebalance","Contributor Tip"]),
});

export const IntentSubmitSchema = z.object({
  walletAddress:   z.string().startsWith("0x").length(42),
  hederaAccountId: z.string().optional().default(""),
  nlHash:          z.string().startsWith("0x"),
  specHash:        z.string().startsWith("0x"),
  specJson:        z.string(),
  category:        z.enum(["Travel Booking","Portfolio Rebalance","Contributor Tip"]),
  signature:       z.string().startsWith("0x"),
});