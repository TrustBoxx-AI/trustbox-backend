/**
 * scripts/utils/encryptSecrets.ts
 * ────────────────────────────────
 * Encrypts GROQ_API_KEY for Chainlink DON-hosted secrets.
 * Run this once before using Chainlink Functions.
 *
 * Run:
 *   ts-node scripts/utils/encryptSecrets.ts
 *
 * Output: CHAINLINK_SECRETS_VERSION added to .env
 */


import { webcrypto } from "crypto"
const nodeCrypto = webcrypto as any
globalThis.crypto = nodeCrypto
Object.defineProperty(globalThis.crypto, 'subtle', {
  value: nodeCrypto.subtle,
  writable: true,
  configurable: true,
})

import * as dotenv from "dotenv"
import * as fs     from "path"
import * as path   from "path"
dotenv.config()

async function main() {
  const {
    SecretsManager,
  } = await import("@chainlink/functions-toolkit")



  const GROQ_API_KEY  = process.env.GROQ_API_KEY
  const DEPLOYER_KEY  = process.env.DEPLOYER_PRIVATE_KEY
  const ROUTER        = "0xA9d587a00A31A52Ed70D6026794a8FC5E2F5dCb0"
  const DON_ID        = "fun-avalanche-fuji-1"
  const RPC_URL       = process.env.AVALANCHE_FUJI_RPC ?? "https://api.avax-test.network/ext/bc/C/rpc"

  if (!GROQ_API_KEY)  { console.error("❌ GROQ_API_KEY not set in .env"); process.exit(1) }
  if (!DEPLOYER_KEY)  { console.error("❌ DEPLOYER_PRIVATE_KEY not set in .env"); process.exit(1) }

  console.log("═══════════════════════════════════════════════════")
  console.log("  TrustBox — Chainlink DON Secrets Encryption")
  console.log("═══════════════════════════════════════════════════\n")

const ethers5 = require("ethers-v5")
const provider = new ethers5.providers.JsonRpcProvider(RPC_URL)
const signer   = new ethers5.Wallet(DEPLOYER_KEY, provider)
  
const sm = new SecretsManager({
  signer:                 signer as any,
  functionsRouterAddress: ROUTER,
  donId:                  DON_ID,
})
  await sm.initialize()
  console.log("✅ SecretsManager initialized")

  // Encrypt secrets
  const { encryptedSecrets } = await sm.encryptSecrets({
    GROQ_API_KEY,
  })
  console.log("✅ Secrets encrypted")

  // Upload to DON (slot 0)
  const {
    version,
    success,
  } = await sm.uploadEncryptedSecretsToDON({
    encryptedSecretsHexstring: encryptedSecrets,
    gatewayUrls: [
      "https://01.functions-gateway.testnet.chain.link/",
      "https://02.functions-gateway.testnet.chain.link/",
    ],
    slotId:     0,
    minutesUntilExpiration: 4320,  // 3 days
  })

  if (!success) {
    throw new Error("Failed to upload secrets to DON")
  }

  console.log(`✅ Secrets uploaded — version: ${version}`)

  // Update .env
  const envPath    = path.resolve(__dirname, "../../.env")
  const envContent = require("fs").readFileSync(envPath, "utf-8")
  const key        = "CHAINLINK_SECRETS_VERSION"
  const regex      = new RegExp(`^${key}=.*$`, "m")
  const newContent = regex.test(envContent)
    ? envContent.replace(regex, `${key}=${version}`)
    : envContent + `\n${key}=${version}`

  require("fs").writeFileSync(envPath, newContent)

  console.log(`\n  ✅ CHAINLINK_SECRETS_VERSION=${version} saved to .env`)
  console.log("═══════════════════════════════════════════════════\n")
}

main().catch(err => {
  console.error("❌ Failed:", err.message)
  process.exit(1)
})