/* scripts/utils/encryptSecrets.ts
   Encrypt GROQ_API_KEY with the Chainlink DON public key
   and upload to the DON secrets manager.
   Run: npx ts-node scripts/utils/encryptSecrets.ts
   ─────────────────────────────────────────────────── */

import { SecretsManager } from "@chainlink/functions-toolkit";
import { ethers }         from "ethers";
import * as dotenv        from "dotenv";
dotenv.config();

async function main() {
  const rpc    = process.env.AVALANCHE_FUJI_RPC!;
  const pk     = process.env.DEPLOYER_PRIVATE_KEY!;
  const router = process.env.CHAINLINK_ROUTER!;
  const donId  = process.env.CHAINLINK_DON_ID!;
  const groqKey= process.env.GROQ_API_KEY!;

  if (!groqKey) {
    console.error("\n❌  GROQ_API_KEY not set in .env\n");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet   = new ethers.Wallet(pk, provider);

  console.log("\n🔐  TrustBox Secrets Encryption\n");
  console.log(`  Wallet:  ${wallet.address}`);
  console.log(`  DON ID:  ${donId}`);
  console.log(`  Router:  ${router}\n`);

  const sm = new SecretsManager({
    signer:                 wallet,
    functionsRouterAddress: router,
    donId,
  });

  console.log("  Initialising SecretsManager...");
  await sm.initialize();

  console.log("  Encrypting GROQ_API_KEY...");
  const { encryptedSecrets } = await sm.encryptSecrets({ GROQ_API_KEY: groqKey });

  console.log("  Uploading to DON (slot 0, 3 day expiry)...");
  const { version, success } = await sm.uploadEncryptedSecretsToDON({
    encryptedSecretsHexstring: encryptedSecrets,
    gatewayUrls: ["https://01.functions-gateway.testnet.chain.link/"],
    slotId:                    0,
    minutesUntilExpiration:    4320, // 3 days
  });

  if (!success) {
    console.error("\n❌  Secrets upload failed\n");
    process.exit(1);
  }

  console.log(`\n✅  Secrets uploaded successfully`);
  console.log(`   Version: ${version}`);
  console.log(`\n   Add to .env:`);
  console.log(`   CHAINLINK_SECRETS_VERSION=${version}\n`);
  console.log("   ⚠  Secrets expire in 3 days — re-run this script before expiry\n");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
