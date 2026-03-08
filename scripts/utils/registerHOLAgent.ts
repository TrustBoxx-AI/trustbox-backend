/* scripts/utils/registerHOLAgent.ts — TrustBox
   Registers TrustBox as an HCS-10 agent via the HOL Registry Broker API.
   Uses RegistryBrokerClient from @hashgraphonline/standards-sdk (correct approach).
   Direct HCS topic writes are rejected — the registry is guarded.

   Run: npx ts-node scripts/utils/registerHOLAgent.ts
   ──────────────────────────────────────────────────────────── */

import * as dotenv from "dotenv";
dotenv.config();

const BROKER_URL  = "https://hol.org/registry/api/v1";
const BACKEND_URL = process.env.BACKEND_URL ?? "https://trustbox-backend-kxkr.onrender.com";

async function main() {
  const accountId   = process.env.HEDERA_OPERATOR_ID;
  const privateKey  = process.env.HEDERA_OPERATOR_KEY;
  const inboxTopic  = process.env.HCS10_INBOX_TOPIC_ID;
  const outboxTopic = process.env.HCS10_OUTBOX_TOPIC_ID;

  if (!accountId || !privateKey) {
    console.error("❌  HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env");
    process.exit(1);
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log("  TrustBox — HOL Registry Broker Registration");
  console.log(`  Operator: ${accountId}`);
  console.log(`  Backend:  ${BACKEND_URL}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // ── 1. Check inbox/outbox topics ─────────────────────────────
  if (!inboxTopic || !outboxTopic) {
    console.log("⚠️  HCS10_INBOX_TOPIC_ID or HCS10_OUTBOX_TOPIC_ID not set.");
    console.log("   Run createHcsTopics.ts first to create inbox/outbox topics.");
    console.log("   Then add them to .env and re-run this script.\n");
    process.exit(1);
  }

  // ── 2. Import SDK ─────────────────────────────────────────────
  let RegistryBrokerClient: any, AIAgentCapability: any, ProfileType: any, AIAgentType: any;
  try {
    const sdk = await import("@hashgraphonline/standards-sdk");
    RegistryBrokerClient = sdk.RegistryBrokerClient;
    AIAgentCapability    = sdk.AIAgentCapability;
    ProfileType          = sdk.ProfileType;
    AIAgentType          = sdk.AIAgentType;
  } catch {
    console.log("⚠️  @hashgraphonline/standards-sdk not installed.");
    console.log("   Run: npm install @hashgraphonline/standards-sdk");
    console.log("\n   Skipping HOL registration — not required for hackathon demo.");
    console.log("   Your inbox/outbox topics are live on HashScan:");
    console.log(`   Inbox:  https://hashscan.io/testnet/topic/${inboxTopic}`);
    console.log(`   Outbox: https://hashscan.io/testnet/topic/${outboxTopic}`);
    process.exit(0);
  }

  // ── 3. Authenticate with ledger credentials ───────────────────
  process.stdout.write("🔐 Authenticating with HOL Registry Broker... ");
  const client = new RegistryBrokerClient({ baseUrl: BROKER_URL });

  try {
    await client.authenticateWithLedgerCredentials({
      accountId,
      network:          "hedera:testnet",
      hederaPrivateKey: privateKey,
      expiresInMinutes: 30,
      label:            "trustbox-registration",
    });
    console.log("✅");
  } catch (err: any) {
    console.log(`\n❌  Auth failed: ${err.message}`);
    console.log("   This is non-critical — your HCS-10 topics are already live.");
    console.log(`   Inbox:  https://hashscan.io/testnet/topic/${inboxTopic}`);
    console.log(`   Outbox: https://hashscan.io/testnet/topic/${outboxTopic}`);
    process.exit(0);
  }

  // ── 4. Register agent profile ─────────────────────────────────
  process.stdout.write("📋 Registering TrustBox agent profile... ");

  const agentAlias = `trustbox_${Date.now().toString(36)}`;

  try {
    const registration = await client.registerAgent({
      profile: {
        type:         ProfileType?.AI_AGENT ?? 1,
        display_name: "TrustBox AI",
        alias:        agentAlias,
        bio:          "Trustworthy AI agent verification, ZK credit scoring, and on-chain audit platform. Built on Avalanche + Hedera.",
        inboundTopicId:  inboxTopic,
        outboundTopicId: outboxTopic,
        aiAgent: {
          type:         AIAgentType?.MANUAL ?? 0,
          capabilities: [
            AIAgentCapability?.TEXT_GENERATION   ?? 0,
            AIAgentCapability?.DATA_ANALYSIS     ?? 3,
          ],
          model:   "llama-3.1-70b-versatile",
          creator: "TrustBox Protocol",
        },
      },
      registry: "hashgraph-online",
    });

    console.log("✅");
    console.log(`\n  UAID:    ${registration.uaid ?? "pending"}`);
    console.log(`  Alias:   ${agentAlias}`);
    console.log(`  Inbox:   https://hashscan.io/testnet/topic/${inboxTopic}`);
    console.log(`  Outbox:  https://hashscan.io/testnet/topic/${outboxTopic}`);
  } catch (err: any) {
    console.log(`\n❌  Registration failed: ${err.message}`);
    console.log("   Non-critical — topics are still live and functional.");
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  ✅  HOL setup complete!");
  console.log("  Add to Render → Environment if not already set:");
  console.log(`  HCS10_INBOX_TOPIC_ID=${inboxTopic}`);
  console.log(`  HCS10_OUTBOX_TOPIC_ID=${outboxTopic}`);
  console.log("═══════════════════════════════════════════════════════\n");
}

main().catch(err => {
  console.error("❌  Fatal:", err.message);
  process.exit(1);
});