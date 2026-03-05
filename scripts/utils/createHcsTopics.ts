/**
 * scripts/utils/createHcsTopics.ts
 * ──────────────────────────────────
 * Creates Hedera HCS topics for TrustBox and saves topic IDs to .env
 *
 * Run once:
 *   ts-node scripts/utils/createHcsTopics.ts
 *
 * Prerequisites in .env:
 *   HEDERA_OPERATOR_ID=0.0.xxxxxx
 *   HEDERA_OPERATOR_KEY=302e...
 */

import * as dotenv from "dotenv"
import * as fs     from "fs"
import * as path   from "path"
dotenv.config()

async function main() {
  const operatorId  = process.env.HEDERA_OPERATOR_ID
  const operatorKey = process.env.HEDERA_OPERATOR_KEY

  if (!operatorId || !operatorKey) {
    console.error("❌ HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env")
    console.error("   Get a free testnet account at: https://portal.hedera.com")
    process.exit(1)
  }

  const {
    Client,
    AccountId,
    PrivateKey,
    TopicCreateTransaction,
  } = await import("@hashgraph/sdk")

  const client = Client.forTestnet()
  client.setOperator(
    AccountId.fromString(operatorId),
    PrivateKey.fromString(operatorKey)
  )

  console.log("═══════════════════════════════════════════════════")
  console.log("  TrustBox — Hedera HCS Topic Creation")
  console.log("  Operator:", operatorId)
  console.log("═══════════════════════════════════════════════════\n")

  const topics: Record<string, string> = {}

  const toCreate = [
    { key: "HCS_CREDIT_TOPIC_ID",  memo: "TrustBox Credit Score Trail"     },
    { key: "HCS_INTENT_TOPIC_ID",  memo: "TrustBox Intent Execution Trail"  },
  ]

  for (const { key, memo } of toCreate) {
    console.log(`📝 Creating topic: ${memo}...`)

    const tx = await new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setAdminKey(PrivateKey.fromString(operatorKey))
      .setSubmitKey(PrivateKey.fromString(operatorKey))
      .execute(client)

    const receipt = await tx.getReceipt(client)
    const topicId = receipt.topicId!.toString()

    topics[key] = topicId
    console.log(`  ✅ ${key} = ${topicId}`)
    console.log(`     Explorer: https://hashscan.io/testnet/topic/${topicId}`)
  }

  // ── Update .env file ──────────────────────────────────────
  const envPath    = path.resolve(__dirname, "../../.env")
  let   envContent = fs.readFileSync(envPath, "utf-8")

  for (const [key, value] of Object.entries(topics)) {
    const regex = new RegExp(`^${key}=.*$`, "m")
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`)
    } else {
      envContent += `\n${key}=${value}`
    }
  }

  fs.writeFileSync(envPath, envContent)
  console.log("\n  ✅ .env updated with topic IDs")

  console.log("\n═══════════════════════════════════════════════════")
  console.log("  ✅ HCS topics created!")
  Object.entries(topics).forEach(([k, v]) => console.log(`  ${k} = ${v}`))
  console.log("═══════════════════════════════════════════════════\n")

  client.close()
}

main().catch(err => {
  console.error("❌ Failed:", err.message)
  process.exit(1)
})