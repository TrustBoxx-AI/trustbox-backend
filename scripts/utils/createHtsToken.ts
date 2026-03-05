/* scripts/utils/createHtsToken.ts
   One-time script to create the TrustBox Credit HTS NFT token on Hedera Testnet.
   Run once before Session 8 testing.
   Run: npx ts-node scripts/utils/createHtsToken.ts
   ──────────────────────────────────────────────────────────────────────────── */

import {
  Client,
  AccountId,
  PrivateKey,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  Hbar,
} from "@hashgraph/sdk";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const operatorId  = process.env.HEDERA_OPERATOR_ID!;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY!;

  if (!operatorId || !operatorKey) {
    console.error("\n❌  HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env\n");
    process.exit(1);
  }

  const client = Client.forTestnet();
  client.setOperator(AccountId.fromString(operatorId), PrivateKey.fromString(operatorKey));

  console.log("\n🏗   Creating TrustBox Credit HTS NFT Token...\n");

  const tx = await new TokenCreateTransaction()
    .setTokenName("TrustBox Credit Credential")
    .setTokenSymbol("TBC")
    .setTokenType(TokenType.NonFungibleUnique)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTreasuryAccountId(AccountId.fromString(operatorId))
    .setSupplyKey(PrivateKey.fromString(operatorKey))
    .setAdminKey(PrivateKey.fromString(operatorKey))
    .setMaxTransactionFee(new Hbar(30))
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const tokenId = receipt.tokenId!.toString();

  console.log(`✅  HTS Token created successfully`);
  console.log(`   Token ID: ${tokenId}`);
  console.log(`   Type:     NonFungibleUnique (NFT)`);
  console.log(`   Symbol:   TBC`);
  console.log(`\n   Add to .env:`);
  console.log(`   HTS_CREDIT_TOKEN_ID=${tokenId}\n`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
