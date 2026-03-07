/* middleware/validate.ts — TrustBox
   Zod request body validators.
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

// ── Shared helpers ────────────────────────────────────────────
// Accepts any 0x-prefixed string — strict 42-char only for real tx signers
const evmAddress = z.string().startsWith("0x").length(42);

// Lenient address — accepts anything the user typed (name, partial addr, etc.)
const anyAddress = z.string().min(1).max(200);

// ── Schemas ───────────────────────────────────────────────────

export const VerifySchema = z.object({
  walletAddress: evmAddress,
  agentName:     z.string().min(1).max(100),
  model:         z.string().min(1).max(100),
  operator:      z.string().min(1).max(100),
  capabilities:  z.string(),
  environment:   z.enum(["production", "staging", "development"]),
});

export const VerifyMintSchema = z.object({
  walletAddress:     evmAddress,
  agentId:           z.string(),
  modelHash:         z.string(),
  capHash:           z.string(),
  metadataURI:       z.string(),
  approvalMessage:   z.string(),
  approvalSignature: z.string().startsWith("0x"),
  trustScore:        z.number().optional(),
});

export const AuditSchema = z.object({
  walletAddress:   evmAddress,
  contractName:    z.string().min(1).max(100),
  // Lenient — user may enter a name, URL, or partial address, not always a full 0x42 addr
  contractAddress: anyAddress,
  chain:           z.string().default("avalanche-fuji"),
  abiSource:       z.string().optional(),
  deployer:        z.string().optional(),
});

export const ScanSchema = z.object({
  walletAddress: evmAddress.optional(),
  entityType:    z.string(),
  entityName:    z.string().min(1).max(100),
  data:          z.record(z.unknown()),
});

export const ScoreSchema = z.object({
  walletAddress:   evmAddress,
  hederaAccountId: z.string().optional().default(""),
  // proof + publicSignals are optional — backend falls back to demo mode when absent
  proof:           z.object({}).passthrough().optional(),
  publicSignals:   z.array(z.string()).optional().default([]),
  modelVersion:    z.string().default("TrustCredit v2.1"),
});

export const BlindAuditSchema = z.object({
  walletAddress:      evmAddress,
  projectName:        z.string().min(1).max(100),
  agentId:            z.string().default("agt_sec_001"),
  // CID is optional — client may not have pre-uploaded
  encryptedBundleCID: z.string().optional().default("QmStubBundle"),
  auditScope:         z.array(z.string()).optional(),
  notes:              z.string().optional(),
});

export const IntentParseSchema = z.object({
  walletAddress: evmAddress,
  nlText:        z.string().min(5).max(2000),
  category:      z.enum(["Travel Booking", "Portfolio Rebalance", "Contributor Tip"]),
});

export const IntentSubmitSchema = z.object({
  walletAddress:   evmAddress,
  hederaAccountId: z.string().optional().default(""),
  nlHash:          z.string().startsWith("0x"),
  specHash:        z.string().startsWith("0x"),
  specJson:        z.string(),
  category:        z.enum(["Travel Booking", "Portfolio Rebalance", "Contributor Tip"]),
  signature:       z.string().startsWith("0x"),
});

// ── Agent register schema ─────────────────────────────────────
export const AgentRegisterSchema = z.object({
  agentId:      z.string().min(1).max(100),
  teeEndpoint:  z.string().url("teeEndpoint must be a valid URL"),
  // encPubKey: 65-byte uncompressed pubkey as hex string (optional — generates stub if absent)
  encPubKey:    z.string().optional(),
  // stake in wei as string (optional — defaults to MIN_STAKE = 0.01 AVAX)
  stakeAmount:  z.string().optional(),
});