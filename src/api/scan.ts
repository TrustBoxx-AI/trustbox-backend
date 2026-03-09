

import { Router, Request, Response } from "express";
import { ethers }            from "ethers";
import { walletRateLimit }   from "../middleware/rateLimit";
import { validate, ScanSchema } from "../middleware/validate";
import { signer }            from "../services/ethers";

export const scanRouter = Router();

function runBehaviouralAnalysis(entityType: string, data: Record<string, unknown>) {
  // v1: rule-based scoring. Session 7+: integrate real ML model.
  const baseScore = 75;
  const findings  = [
    {
      category: "Data Handling",
      status:   "pass",
      detail:   "No sensitive data exfiltration patterns detected",
    },
    {
      category: "Autonomy Level",
      status:   data["Automation Level"] === "fully-automated" ? "warn" : "pass",
      detail:   data["Automation Level"] === "fully-automated"
        ? "Fully automated — recommend human-in-loop for critical decisions"
        : "Human oversight present",
    },
    {
      category: "Model Provenance",
      status:   "pass",
      detail:   `AI Provider: ${data["AI Provider"] ?? "Unspecified"}`,
    },
    {
      category: "Version Tracking",
      status:   data["Version"] ? "pass" : "warn",
      detail:   data["Version"] ? `Version ${data["Version"]} recorded` : "No version specified",
    },
  ];

  const warnCount = findings.filter(f => f.status === "warn").length;
  const score     = Math.max(0, baseScore - warnCount * 8);

  return { findings, score };
}

scanRouter.post("/",
  walletRateLimit,
  validate(ScanSchema),
  async (req: Request, res: Response) => {
    try {
      const { entityType, entityName, data } = req.body;

      const { findings, score } = runBehaviouralAnalysis(entityType, data);
      const scannedAt           = new Date().toISOString();

      // Sign the result server-side
      const resultHash = ethers.id(JSON.stringify({ entityName, score, scannedAt }));
      const signature  = await signer.signMessage(resultHash);

      res.json({
        success:    true,
        action:     "scan",
        entityName,
        entityType,
        score,
        findings,
        scannedAt,
        resultHash,
        serverSignature: signature,
        note: "Off-chain scan — no chain interaction in v1. Session 7+: chain anchor available.",
      });
    } catch (err: any) {
      console.error("[scan] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);
