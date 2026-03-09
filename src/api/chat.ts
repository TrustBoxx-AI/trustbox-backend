

import { Router, Request, Response } from "express";
import { apiLimiter }    from "../middleware/rateLimit";
import {
  routeMessage,
  TRUSTBOX_AGENT,
  sendHCS10Response,
  writeToOutbox,
  pollInbox,
} from "../services/hol";
import { HEDERA_CONFIG, HOL_CONFIG as HC } from "../config/chains";
// HOL_CONFIG is imported as HC from chains — use HC throughout this file

export const chatRouter = Router();

// ── POST /api/agent/chat ──────────────────────────────────────
chatRouter.post("/chat", apiLimiter, async (req: Request, res: Response) => {
  const {
    message,               // natural language input (required)
    walletAddress,         // EVM address (optional — needed for audit/verify/score)
    hederaAccountId,       // 0.0.xxxxx (optional — for NFT mint)
    operator_id,           // HCS-10 sender Hedera account (optional)
    reply_topic,           // HCS-10 reply topic (A2A use)
    request_id,            // correlation ID
    context,               // any extra context fields
  } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const startedAt = Date.now();
  const routing   = routeMessage(message);

  console.log(`[chat] "${message.slice(0, 80)}" → intent: ${routing.intent} (${routing.confidence})`);

  try {
    let result: Record<string, unknown> = {};

    // ── Route to appropriate TrustBox primitive ───────────────
    switch (routing.intent) {

      // ── Smart Contract Audit ──────────────────────────────
      case "audit": {
        const contractAddress = (routing.params.contractAddress as string)
          || (context?.contractAddress as string)
          || "0x0000000000000000000000000000000000000000";
        const contractName    = (routing.params.contractName as string) || "Unknown Contract";

        const auditRes = await fetch(`${TRUSTBOX_AGENT.endpoint}/api/audit`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ walletAddress: walletAddress ?? "0x0000000000000000000000000000000000000000", contractAddress, contractName }),
        });
        const auditData = await auditRes.json() as any;
        result = {
          action:   "audit",
          summary:  auditData.summary ?? `Audit complete — score: ${auditData.score ?? "N/A"}`,
          score:    auditData.score,
          findings: auditData.findings?.slice(0, 3) ?? [],   // top 3
          txHash:   auditData.txHash,
          reportCID:auditData.reportCID,
          hcs:      { topicId: auditData.hcsTopicId, seq: auditData.hcsSequenceNum },
          reply:    buildAuditReply(auditData),
        };
        break;
      }

      // ── ERC-8004 Agent Verification ───────────────────────
      case "verify": {
        const agentName    = (routing.params.agentName as string) || "My Agent";
        const model        = (routing.params.model    as string) || "custom";
        const capabilities = (context?.capabilities  as string) || "analysis, reasoning";
        const environment  = (context?.environment   as string) || "cloud";

        result = {
          action:  "verify",
          summary: `To mint an ERC-8004 credential for "${agentName}", POST to /api/verify/prepare with: agentName, model, operator (your wallet), capabilities (comma-separated), environment. Then sign the approval in MetaMask and POST to /api/verify/mint.`,
          example: {
            url:  "/api/verify/prepare",
            body: { walletAddress: walletAddress ?? "0x...", agentName, model, operator: walletAddress ?? "0x...", capabilities, environment },
          },
          reply: `I can mint an ERC-8004 TrustBox Agent Credential (TBAC) NFT for "${agentName}" on Avalanche Fuji with a Hedera HCS trail. Provide your wallet address and I'll generate the approval message for you to sign.`,
        };
        break;
      }

      // ── ZK Credit Score ───────────────────────────────────
      case "score": {
        result = {
          action:  "score",
          summary: "ZK credit scores are computed in the browser using snarkjs Groth16. The proof is verified server-side and anchored to Hedera HCS + HTS NFT.",
          reply:   "ZK credit scoring works in the browser — visit the TrustBox dashboard and add a Credit Profile entity. The Groth16 proof is generated client-side (your data never leaves your device unencrypted) and I verify it server-side before anchoring to Hedera.",
          example: {
            url:  "/api/score",
            body: { walletAddress: walletAddress ?? "0x...", hederaAccountId: hederaAccountId ?? "0.0.xxxxx", proof: "<groth16 proof>", publicSignals: [], modelVersion: "TrustCredit v2.1" },
          },
        };
        break;
      }

      // ── Agent Hire ────────────────────────────────────────
      case "hire": {
        const agentsRes  = await fetch(`${TRUSTBOX_AGENT.endpoint}/api/agents`);
        const agentsData = await agentsRes.json() as any;
        const agents     = agentsData.agents ?? [];
        const active     = agents.filter((a: any) => a.status === "active");

        result = {
          action:  "hire",
          summary: `Found ${active.length} active agents in the TrustBox marketplace.`,
          agents:  active.slice(0, 5).map((a: any) => ({
            id:           a.id,
            teeEndpoint:  a.teeEndpoint,
            jobsCompleted:a.jobsCompleted,
            stake:        a.stake,
          })),
          reply: active.length > 0
            ? `I found ${active.length} active agents. To hire one, POST to /api/agents/hire with { agentId, operator }. The agent will receive your encrypted job bundle via their TEE endpoint.`
            : "No active agents found in the marketplace right now. Agents can be registered via /api/agents/register.",
        };
        break;
      }

      // ── List Agents ───────────────────────────────────────
      case "list_agents": {
        const listRes  = await fetch(`${TRUSTBOX_AGENT.endpoint}/api/agents`);
        const listData = await listRes.json() as any;
        const list     = listData.agents ?? [];

        result = {
          action:  "list_agents",
          count:   list.length,
          agents:  list.slice(0, 10).map((a: any) => ({
            id:           a.id,
            status:       a.status,
            jobsCompleted:a.jobsCompleted,
            teeEndpoint:  a.teeEndpoint,
          })),
          reply: list.length > 0
            ? `There are ${list.length} agents registered in the TrustBox marketplace:\n${list.slice(0, 5).map((a: any) => `• ${a.id} (${a.status}, ${a.jobsCompleted} jobs)`).join("\n")}`
            : "No agents registered yet. Use /api/agents/register to add one.",
        };
        break;
      }

      // ── NL Intent (Chainlink Functions) ──────────────────
      case "intent": {
        const nlText   = routing.params.nlText as string;
        const category = routing.params.category as string;

        const parseRes  = await fetch(`${TRUSTBOX_AGENT.endpoint}/api/intent/parse`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ walletAddress: walletAddress ?? "0x0000000000000000000000000000000000000000", nlText, category }),
        });
        const parseData = await parseRes.json() as any;

        result = {
          action:   "intent",
          specJson: parseData.specJson,
          specHash: parseData.specHash,
          reply:    parseData.success
            ? `I parsed your intent via Chainlink Functions:\n\nAction: ${parseData.specJson?.action}\nEntity: ${parseData.specJson?.entity}\n\nReview the spec and sign with MetaMask at /api/intent/submit to execute on-chain.`
            : `Intent parsing failed: ${parseData.error}`,
          nextStep: "POST /api/intent/submit with the specHash signed by your wallet",
        };
        break;
      }

      // ── Help / Capability list ────────────────────────────
      case "help":
      default: {
        result = {
          action:       "help",
          agent:        TRUSTBOX_AGENT.name,
          version:      TRUSTBOX_AGENT.version,
          description:  TRUSTBOX_AGENT.description,
          capabilities: [
            { name: "smart_contract_audit",  command: "audit <contractAddress>",       description: "Run security analysis, anchor Merkle root to AuditRegistry.sol + Hedera HCS" },
            { name: "ai_agent_verify",       command: "verify my agent <name>",         description: "Mint ERC-8004 TrustBox Agent Credential NFT with HITL MetaMask approval" },
            { name: "zk_credit_score",       command: "check my credit score",          description: "Groth16 ZK proof verified server-side, HTS NFT + HCS trail on Hedera" },
            { name: "agent_hire",            command: "hire an agent",                  description: "Find and hire active TEE agents from the TrustBox AgentMarketplace" },
            { name: "agent_list",            command: "list agents",                    description: "Browse all registered agents in the TrustBox marketplace" },
            { name: "intent_execute",        command: "book / rebalance / tip ...",     description: "Parse NL intent via Chainlink Functions, execute on IntentVault.sol" },
          ],
          hcs10: {
            inboxTopic:  HC.inboxTopicId ?? "set HCS10_INBOX_TOPIC_ID",
            outboxTopic: HC.outboxTopicId ?? "set HCS10_OUTBOX_TOPIC_ID",
            protocol:    "hcs-10",
            hashscan:    HC.inboxTopicId ? `https://hashscan.io/testnet/topic/${HC.inboxTopicId}` : null,
          },
          reply: buildHelpReply(),
        };
        break;
      }
    }

    // ── Write to HCS-10 outbox ────────────────────────────────
    await writeToOutbox("response", {
      input:    message.slice(0, 200),
      routing:  { intent: routing.intent, confidence: routing.confidence },
      result:   { action: result.action, summary: result.summary ?? result.reply },
    });

    // ── A2A: respond to caller's reply_topic if provided ─────
    if (reply_topic && request_id) {
      await sendHCS10Response(reply_topic, request_id, {
        intent: routing.intent,
        ...result,
      });
    }

    return res.json({
      ok:         true,
      agentId:    TRUSTBOX_AGENT.id,
      agentName:  TRUSTBOX_AGENT.name,
      intent:     routing.intent,
      confidence: routing.confidence,
      result,
      reply:      result.reply ?? result.summary ?? "Done.",
      latencyMs:  Date.now() - startedAt,
      hcs10: {
        outboxTopic: HC.outboxTopicId ?? null,
        protocol:    "hcs-10",
      },
    });

  } catch (err: any) {
    console.error("[chat] Error:", err.message);

    // Still write error to outbox for transparency
    await writeToOutbox("response", {
      input:  message.slice(0, 200),
      error:  err.message,
      intent: routing.intent,
    }).catch(() => {});

    return res.status(500).json({ error: err.message, intent: routing.intent });
  }
});

// ── GET /api/agent/identity ───────────────────────────────────
// HOL-standard identity endpoint — registry can link here
chatRouter.get("/identity", (_req: Request, res: Response) => {
  res.json({
    ...TRUSTBOX_AGENT,
    protocol:   "hcs-10",
    inboxTopic:  HC.inboxTopicId  ?? null,
    outboxTopic: HC.outboxTopicId ?? null,
    holRegistry: HC.registryTopicId ?? null,
    hashscan: {
      inbox:  HC.inboxTopicId  ? `https://hashscan.io/testnet/topic/${HC.inboxTopicId}`  : null,
      outbox: HC.outboxTopicId ? `https://hashscan.io/testnet/topic/${HC.outboxTopicId}` : null,
    },
    operator: HEDERA_CONFIG.operatorId ?? null,
    network:  "testnet",
  });
});

// ── GET /api/agent/inbox ──────────────────────────────────────
// Returns latest messages sent to TrustBox inbox topic
chatRouter.get("/inbox", apiLimiter, async (_req: Request, res: Response) => {
  try {
    const messages = await pollInbox(20);
    res.json({ ok: true, count: messages.length, messages });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/agent/outbox ─────────────────────────────────────
// Latest activity published by TrustBox — anyone can subscribe
chatRouter.get("/outbox", apiLimiter, async (_req: Request, res: Response) => {
  try {
    const { fetchLatestHCSMessages } = await import("../services/hedera");
    const topicId = HC.outboxTopicId;
    if (!topicId) return res.json({ ok: true, count: 0, messages: [] });
    const messages = await fetchLatestHCSMessages(topicId, 20);
    res.json({ ok: true, count: messages.length, messages });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helpers ───────────────────────────────────────────────────
function buildAuditReply(data: any): string {
  if (!data?.success) return `Audit failed: ${data?.error ?? "unknown error"}`;
  const sev = data.findings?.reduce((acc: any, f: any) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const sevStr = Object.entries(sev ?? {}).map(([k, v]) => `${v} ${k}`).join(", ");
  return `Audit complete for ${data.contractName ?? "contract"} — score: ${data.score}/100. Findings: ${sevStr || "none"}. Report pinned to IPFS (${data.reportCID?.slice(0, 12)}...). Anchored to AuditRegistry.sol (tx: ${data.txHash?.slice(0, 10)}...) and Hedera HCS seq #${data.hcsSequenceNum}.`;
}

function buildHelpReply(): string {
  return `I'm the TrustBox Orchestrator — verifiable trust infrastructure for AI.

Here's what I can do:

🔍 AUDIT  — "audit 0x62e2Ba19..."
   Static security analysis + Merkle-root anchored to AuditRegistry.sol

◈ VERIFY  — "verify my agent MyAgentName"
   Mint an ERC-8004 agent credential NFT (TBAC) on Avalanche Fuji

◎ SCORE   — "check my credit score"
   ZK Groth16 proof → Hedera HCS + HTS TBCC credential NFT

👥 HIRE   — "hire an audit agent"
   Browse and hire TEE agents from the TrustBox marketplace

⟡ INTENT — "book a hotel in NYC under $400"
   Chainlink Functions parses your intent → MetaMask HITL → on-chain

I communicate via HCS-10 — subscribe to my outbox on HashScan to follow my activity.`;
}
