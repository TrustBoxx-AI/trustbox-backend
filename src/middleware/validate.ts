/* middleware/validate.ts — TrustBox
   Zod request body validators for all 6 endpoints.
   ─────────────────────────────────────────────── */

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
  model:         z.string().min(1).max(100),
  operator:      z.string().min(1).max(100),
  capabilities:  z.string(),
  environment:   z.enum(["production", "staging", "development"]),
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
  walletAddress:    z.string().startsWith("0x").length(42),
  hederaAccountId:  z.string(),
  proof:            z.object({}),  // Groth16 proof object from client
  publicSignals:    z.array(z.string()),
  modelVersion:     z.string().default("TrustCredit v2.1"),
});

export const BlindAuditSchema = z.object({
  walletAddress:      z.string().startsWith("0x").length(42),
  projectName:        z.string().min(1).max(100),
  agentId:            z.string(),
  encryptedBundleCID: z.string(),   // CID uploaded by client before this call
  auditScope:         z.array(z.string()).optional(),
  notes:              z.string().optional(),
});

export const IntentParseSchema = z.object({
  walletAddress: z.string().startsWith("0x").length(42),
  nlText:        z.string().min(5).max(2000),
  category:      z.enum(["Travel Booking", "Portfolio Rebalance", "Contributor Tip"]),
});

export const IntentSubmitSchema = z.object({
  walletAddress:  z.string().startsWith("0x").length(42),
  hederaAccountId:z.string(),
  nlHash:         z.string().startsWith("0x"),
  specHash:       z.string().startsWith("0x"),
  specJson:       z.string(),
  category:       z.enum(["Travel Booking", "Portfolio Rebalance", "Contributor Tip"]),
  signature:      z.string().startsWith("0x"),
});


export const validateBlindAudit = validate(
  z.object({
    contractAddr:  z.string().min(1),
    agentId:       z.string().min(1),
    agentOperator: z.string().min(1),
    walletAddress: z.string().min(1),
    auditScope:    z.array(z.string()).optional(),
    projectName:   z.string().optional(),
  })
)