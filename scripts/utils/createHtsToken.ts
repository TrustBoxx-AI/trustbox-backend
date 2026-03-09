
import * as dotenv from "dotenv";
import * as fs     from "fs";
import * as path   from "path";
dotenv.config();

async function main() {
  const operatorId  = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;

  if (!operatorId || !operatorKey) {
    console.error("❌  HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env");
    console.error("    Get a free testnet account at: https://portal.hedera.com");
    process.exit(1);
  }

  const {
    Client,
    AccountId,
    PrivateKey,
    TokenCreateTransaction,
    TokenType,
    TokenSupplyType,
    Hbar,
  } = await import("@hashgraph/sdk");

  // Auto-detect key format to avoid INVALID_SIGNATURE
  const raw = operatorKey.trim();
  let privKey: any;
  if (raw.startsWith("302e") || raw.startsWith("3026") ||
      raw.startsWith("3030") || raw.startsWith("3077")) {
    privKey = PrivateKey.fromStringDer(raw);
  } else if (raw.startsWith("0x")) {
    privKey = PrivateKey.fromStringECDSA(raw.slice(2));
  } else if (raw.length === 64) {
    try { privKey = PrivateKey.fromStringECDSA(raw); }
    catch { privKey = PrivateKey.fromStringED25519(raw); }
  } else {
    privKey = PrivateKey.fromString(raw);
  }
  const client  = Client.forTestnet();
  client.setOperator(AccountId.fromString(operatorId), privKey);

  console.log("═══════════════════════════════════════════════════════");
  console.log("  TrustBox — Hedera HTS NFT Token Creation");
  console.log(`  Operator: ${operatorId}`);
  console.log("═══════════════════════════════════════════════════════\n");

  console.log("📦 Creating HTS NFT collection: TrustBox Credit Credential (TBCC)...");

  const tx = await new TokenCreateTransaction()
    .setTokenName("TrustBox Credit Credential")
    .setTokenSymbol("TBCC")
    .setTokenType(TokenType.NonFungibleUnique)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTreasuryAccountId(AccountId.fromString(operatorId))
    .setAdminKey(privKey.publicKey)   // allows future token updates
    .setSupplyKey(privKey.publicKey)  // required to mint new serials
    .setTokenMemo("TrustBox ZK Credit Score NFT — https://trustbox-ai.vercel.app")
    .setInitialSupply(0)              // NFT collections start at 0
    .setMaxTransactionFee(new Hbar(30))
    .freezeWith(client)
    .sign(privKey);

  const response = await tx.execute(client);
  const receipt  = await response.getReceipt(client);
  const tokenId  = receipt.tokenId!.toString();

  console.log(`\n  ✅ HTS NFT Token Created!`);
  console.log(`  Token ID:     ${tokenId}`);
  console.log(`  HashScan:     https://hashscan.io/testnet/token/${tokenId}`);

  // ── Write to .env ────────────────────────────────────────────
  const envPath    = path.resolve(process.cwd(), ".env");
  let   envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

  const regex = /^HTS_CREDIT_TOKEN_ID=.*$/m;
  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `HTS_CREDIT_TOKEN_ID=${tokenId}`);
  } else {
    envContent += `\nHTS_CREDIT_TOKEN_ID=${tokenId}`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log("  .env updated with HTS_CREDIT_TOKEN_ID\n");

  console.log("═══════════════════════════════════════════════════════");
  console.log("  ✅ Done! Add this to your Render environment:");
  console.log(`  HTS_CREDIT_TOKEN_ID=${tokenId}`);
  console.log("═══════════════════════════════════════════════════════\n");

  console.log("Next steps:");
  console.log("  1. Add HTS_CREDIT_TOKEN_ID to Render → Environment");
  console.log("  2. Users need to associate the token before receiving NFTs:");
  console.log(`     hashscan.io/testnet/token/${tokenId}`);
  console.log("  3. Test a mint: POST /api/score with a valid wallet + hederaAccountId\n");

  client.close();
}

main().catch(err => {
  console.error("❌  Failed:", err.message);
  process.exit(1);
});
