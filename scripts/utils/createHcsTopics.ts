
import * as dotenv from "dotenv";
dotenv.config();

async function getClient() {
  const { Client, AccountId, PrivateKey } = await import("@hashgraph/sdk");

  const operatorId  = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env");
  }

  // Auto-detect key format
  const raw = operatorKey.trim();
  let privateKey: any;

  if (raw.startsWith("302e") || raw.startsWith("3026") ||
      raw.startsWith("3030") || raw.startsWith("3077")) {
    // DER-encoded (ED25519 or ECDSA)
    privateKey = PrivateKey.fromStringDer(raw);
  } else if (raw.startsWith("0x")) {
    // EVM-style hex (strip 0x)
    privateKey = PrivateKey.fromStringECDSA(raw.slice(2));
  } else if (raw.length === 64) {
    // Raw 32-byte hex — try ECDSA first (Hedera Portal default), then ED25519
    try { privateKey = PrivateKey.fromStringECDSA(raw); }
    catch { privateKey = PrivateKey.fromStringED25519(raw); }
  } else {
    // Fallback — let SDK figure it out
    privateKey = PrivateKey.fromString(raw);
  }

  const client = Client.forTestnet();
  client.setOperator(AccountId.fromString(operatorId), privateKey);
  return client;
}

async function createTopic(client: any, memo: string): Promise<string> {
  const { TopicCreateTransaction } = await import("@hashgraph/sdk");

  const tx = await new TopicCreateTransaction()
    .setTopicMemo(memo)
    .setSubmitKey((await import("@hashgraph/sdk")).PrivateKey.fromString(
      process.env.HEDERA_OPERATOR_KEY!
    ).publicKey)
    .execute(client);

  const receipt = await tx.getReceipt(client);
  return receipt.topicId!.toString();
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  TrustBox — Hedera HCS Topic Creation");
  console.log(`  Operator: ${process.env.HEDERA_OPERATOR_ID}`);
  console.log("═══════════════════════════════════════════════════\n");

  const client = await getClient();

  const topics: Record<string, string> = {};

  const toCreate = [
    { key: "HCS_CREDIT_TOPIC_ID",  memo: "TrustBox Credit Score Trail"       },
    { key: "HCS_AUDIT_TOPIC_ID",   memo: "TrustBox Audit Trail"               },
    { key: "HCS_INTENT_TOPIC_ID",  memo: "TrustBox Intent Execution Trail"    },
    { key: "HCS_AGENT_TOPIC_ID",   memo: "TrustBox Agent Verification Trail"  },
  ];

  for (const { key, memo } of toCreate) {
    process.stdout.write(`📝 Creating topic: ${memo}... `);
    try {
      const topicId = await createTopic(client, memo);
      topics[key] = topicId;
      console.log(`✅ ${topicId}`);
    } catch (err: any) {
      console.log(`❌ ${err.message}`);
      process.exit(1);
    }
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Add these to your .env and Render environment:");
  console.log("═══════════════════════════════════════════════════");
  for (const [key, val] of Object.entries(topics)) {
    console.log(`${key}=${val}`);
  }

  console.log("\n  Also add to Render → Environment → Add Variable");
  console.log("═══════════════════════════════════════════════════\n");

  client.close();
}

main().catch(err => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
