/* services/hol.ts — TrustBox
   Hashgraph Online (HOL) Standards Integration
   ─────────────────────────────────────────────────────────────
   Implements:
     • HOL Registry Broker registration via HCS-10
     • HCS-10 inbox/outbox message protocol
     • Agent-to-Agent (A2A) message routing
     • Natural language → TrustBox primitive routing

   HOL Registry Broker: agents register by submitting a standard
   JSON envelope to the HOL registry HCS topic. Any client that
   knows the registry topic can discover TrustBox and reach it
   via HCS-10 or the REST chat endpoint.

   HCS-10 Message Envelope (standard):
     {
       p:           "hcs-10",
       op:          "message" | "register" | "query",
       operator_id: "0.0.xxxxxx",           // sender Hedera account
       agent_id:    "trustbox-orchestrator",
       t:           "<ISO timestamp>",
       data:        { ... }                  // message payload
     }
   ─────────────────────────────────────────────────────────────*/

import { HEDERA_CONFIG, HOL_CONFIG } from "../config/chains";
import { submitHCSMessage, fetchLatestHCSMessages } from "./hedera";

// ── HCS-10 message types ──────────────────────────────────────
export type HCS10Op = "register" | "message" | "query" | "response" | "hire" | "probe";

export interface HCS10Envelope {
  p:            "hcs-10";
  op:           HCS10Op;
  operator_id:  string;
  agent_id:     string;
  t:            string;
  data:         Record<string, unknown>;
  reply_to?:    string;          // outbox topic ID for A2A replies
  request_id?:  string;          // for correlating responses
}

// ── TrustBox Orchestrator agent identity ─────────────────────
export const TRUSTBOX_AGENT = {
  id:           "trustbox-orchestrator",
  name:         "TrustBox Orchestrator",
  version:      "1.0.0",
  description:  "Verifiable trust infrastructure for AI. I can audit smart contracts, verify AI agent credentials (ERC-8004), score credit risk with ZK proofs, and execute natural language intents on-chain. I can also hire specialised TEE audit agents from the TrustBox marketplace.",
  capabilities: [
    "smart_contract_audit",
    "zk_credit_score",
    "ai_agent_verify_erc8004",
    "blind_tee_audit",
    "intent_execute",
    "agent_hire",
    "agent_list",
  ],
  endpoint:     process.env.BACKEND_URL ?? "https://trustbox-backend-kxkr.onrender.com",
  chatEndpoint: "/api/agent/chat",
  hcs10Version: "1.0",
  network:      "testnet",
  chains:       ["hedera", "avalanche-fuji"],
};

// ── Send an HCS-10 formatted message to any topic ─────────────
export async function sendHCS10Message(
  topicId:   string,
  op:        HCS10Op,
  data:      Record<string, unknown>,
  opts:      { requestId?: string; replyTo?: string } = {}
): Promise<{ sequenceNumber: string; explorerUrl: string }> {
  const operatorId = HEDERA_CONFIG.operatorId;
  if (!operatorId) throw new Error("HEDERA_OPERATOR_ID not set");

  const envelope: HCS10Envelope = {
    p:           "hcs-10",
    op,
    operator_id: operatorId,
    agent_id:    TRUSTBOX_AGENT.id,
    t:           new Date().toISOString(),
    data,
    ...(opts.requestId && { request_id: opts.requestId }),
    ...(opts.replyTo   && { reply_to:   opts.replyTo }),
  };

  return submitHCSMessage(topicId, envelope);
}

// ── Register TrustBox Orchestrator in the HOL Registry Broker ─
// This submits a standard HOL registration message to the
// HOL Registry topic on Hedera testnet.
// Run once via scripts/utils/registerHOLAgent.ts
export async function registerInHOLRegistry(): Promise<{
  sequenceNumber: string;
  explorerUrl:    string;
  inboxTopicId:   string;
  outboxTopicId:  string;
}> {
  const registryTopicId = HOL_CONFIG.registryTopicId;
  if (!registryTopicId) throw new Error("HOL_REGISTRY_TOPIC_ID not set in .env");

  const inboxTopicId  = HOL_CONFIG.inboxTopicId;
  const outboxTopicId = HOL_CONFIG.outboxTopicId;
  if (!inboxTopicId || !outboxTopicId) {
    throw new Error("HCS10_INBOX_TOPIC_ID and HCS10_OUTBOX_TOPIC_ID must be set — run createHcsTopics.ts first");
  }

  const result = await sendHCS10Message(registryTopicId, "register", {
    agent:        TRUSTBOX_AGENT,
    inbox_topic:  inboxTopicId,
    outbox_topic: outboxTopicId,
    // HOL Registry standard fields
    pfp:          "https://trustbox-ai.vercel.app/logo.png",
    website:      "https://trustbox-ai.vercel.app",
    links: {
      demo:   "https://trustbox-ai.vercel.app",
      api:    `${TRUSTBOX_AGENT.endpoint}/api/agent/chat`,
      github: "https://github.com/[your-handle]/trustbox-ai",
    },
    tags: ["audit", "zk", "erc-8004", "intent", "tee", "defi", "trust"],
  });

  console.log(`[hol] Registered in HOL Registry — seq: ${result.sequenceNumber}`);
  console.log(`[hol] Inbox:  ${inboxTopicId}`);
  console.log(`[hol] Outbox: ${outboxTopicId}`);

  return {
    ...result,
    inboxTopicId,
    outboxTopicId,
  };
}

// ── Poll inbox for incoming HCS-10 messages ───────────────────
// Used by the background message processor. Returns decoded
// envelopes from the inbox topic, most recent first.
export async function pollInbox(limit = 20): Promise<HCS10Envelope[]> {
  const inboxTopicId = HOL_CONFIG.inboxTopicId;
  if (!inboxTopicId) return [];

  const messages = await fetchLatestHCSMessages(inboxTopicId, limit);
  return messages
    .map(m => {
      try {
        const env = m.payload as HCS10Envelope;
        if (env?.p === "hcs-10") return env;
        return null;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as HCS10Envelope[];
}

// ── Send a response to an agent's reply_to topic ─────────────
export async function sendHCS10Response(
  replyToTopicId: string,
  requestId:      string,
  result:         Record<string, unknown>
): Promise<void> {
  try {
    await sendHCS10Message(
      replyToTopicId,
      "response",
      { success: true, result },
      { requestId }
    );
  } catch (err: any) {
    console.warn(`[hol] Failed to send HCS-10 response to ${replyToTopicId}:`, err.message);
  }
}

// ── Also write to our own outbox ─────────────────────────────
// All responses are mirrored to the TrustBox outbox topic so
// any subscriber can follow the agent's activity stream.
export async function writeToOutbox(
  op:   HCS10Op,
  data: Record<string, unknown>
): Promise<void> {
  const outboxTopicId = HOL_CONFIG.outboxTopicId;
  if (!outboxTopicId) return;

  try {
    await sendHCS10Message(outboxTopicId, op, data);
  } catch (err: any) {
    console.warn("[hol] Outbox write failed:", err.message);
  }
}

// ── Intent router — NL message → TrustBox primitive ──────────
// Detects what the user/agent is asking for and returns a
// routing decision. The actual execution is done by api/chat.ts.
export type TrustBoxIntent =
  | "audit"       // smart contract audit
  | "verify"      // ERC-8004 agent verify
  | "score"       // ZK credit score
  | "hire"        // hire an agent from marketplace
  | "list_agents" // list available agents
  | "intent"      // NL intent execution
  | "help"        // list capabilities
  | "unknown";

interface RoutingDecision {
  intent:    TrustBoxIntent;
  params:    Record<string, unknown>;
  confidence: "high" | "medium" | "low";
}

export function routeMessage(text: string): RoutingDecision {
  const t = text.toLowerCase().trim();

  // Smart contract audit
  if (/audit|scan|secur|vulnerabilit|exploit|reentr|overflow|check contract|analyse contract/.test(t)) {
    const addrMatch = text.match(/0x[a-fA-F0-9]{40}/);
    return {
      intent:     "audit",
      params:     { contractAddress: addrMatch?.[0] ?? "", contractName: extractContractName(text) },
      confidence: addrMatch ? "high" : "medium",
    };
  }

  // Agent verification
  if (/verif|register agent|erc.?8004|credential|certif|agent nft|mint.*agent/.test(t)) {
    return {
      intent:     "verify",
      params:     { agentName: extractAgentName(text), model: extractModel(text) },
      confidence: "high",
    };
  }

  // Credit score
  if (/credit|score|zk proof|financial|risk|groth|snark|proof/.test(t)) {
    const walletMatch = text.match(/0x[a-fA-F0-9]{40}/);
    return {
      intent:     "score",
      params:     { walletAddress: walletMatch?.[0] ?? "" },
      confidence: "high",
    };
  }

  // Hire agent
  if (/hire|find.*agent|get.*agent|assign.*agent|need.*agent/.test(t)) {
    return {
      intent:     "hire",
      params:     { query: text },
      confidence: "high",
    };
  }

  // List agents
  if (/list.*agent|show.*agent|available.*agent|what.*agent|agents available|who.*agent/.test(t)) {
    return {
      intent:     "list_agents",
      params:     {},
      confidence: "high",
    };
  }

  // Help / capabilities
  if (/help|what can you|capabilities|what do you|commands|options/.test(t)) {
    return { intent: "help", params: {}, confidence: "high" };
  }

  // Anything else → try as an intent
  if (t.length > 10) {
    return {
      intent:     "intent",
      params:     { nlText: text, category: detectCategory(text) },
      confidence: "low",
    };
  }

  return { intent: "unknown", params: {}, confidence: "low" };
}

// ── Helpers ───────────────────────────────────────────────────
function extractContractName(text: string): string {
  const m = text.match(/(?:named?|called?|contract)\s+([A-Z][a-zA-Z0-9]+)/);
  return m?.[1] ?? "Unknown Contract";
}

function extractAgentName(text: string): string {
  const m = text.match(/(?:agent|named?|called?)\s+([A-Za-z0-9\-_]+)/i);
  return m?.[1] ?? "Agent";
}

function extractModel(text: string): string {
  const models = ["gpt-4", "gpt-3.5", "llama", "claude", "gemini", "mistral", "qwen"];
  for (const model of models) {
    if (text.toLowerCase().includes(model)) return model;
  }
  return "custom";
}

function detectCategory(text: string): string {
  const t = text.toLowerCase();
  if (/hotel|flight|travel|book|trip|airbnb/.test(t))     return "Travel Booking";
  if (/portfolio|rebalance|invest|defi|token|swap/.test(t)) return "Portfolio Rebalance";
  if (/tip|pay|send|contributor|donate/.test(t))           return "Contributor Tip";
  return "Travel Booking"; // default
}