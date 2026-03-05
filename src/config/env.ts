/* config/env.ts — TrustBox */

import { z }        from "zod"
import * as dotenv  from "dotenv"
dotenv.config()

const EnvSchema = z.object({

  // Server
  PORT:            z.string().default("4000"),
  NODE_ENV:        z.enum(["development", "production", "test"]).default("development"),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_SECRET:      z.string().min(16).default("dev-secret-change-in-prod-min16chars"),
  API_BASE_URL:    z.string().default("https://trustbox-backend-kxkr.onrender.com"),

  // Supabase
  SUPABASE_URL:         z.string().default(""),
  SUPABASE_SERVICE_KEY: z.string().default(""),

  // Avalanche Fuji
  AVALANCHE_FUJI_RPC:   z.string().url().default("https://api.avax-test.network/ext/bc/C/rpc"),
  DEPLOYER_PRIVATE_KEY: z.string().startsWith("0x").length(66),

  // Contract addresses
  TRUST_REGISTRY_ADDR:     z.string().optional(),
  AUDIT_REGISTRY_ADDR:     z.string().optional(),
  AGENT_MARKETPLACE_ADDR:  z.string().optional(),
  INTENT_VAULT_ADDR:       z.string().optional(),
  FUNCTIONS_CONSUMER_ADDR: z.string().optional(),

  // Chainlink
  CHAINLINK_SUBSCRIPTION_ID:     z.string().optional(),
  CHAINLINK_DON_ID:              z.string().default("fun-avalanche-fuji-1"),
  CHAINLINK_ROUTER:              z.string().default("0xA9d587a00A31A52Ed70D6026794a8FC5E2F5dCb0"),
  CHAINLINK_LINK_TOKEN:          z.string().default("0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846"),
  CHAINLINK_AUTOMATION_REGISTRY: z.string().default("0x819B58A646CDd8289275A87653a2aA4902b14fe6"),
  CHAINLINK_UPKEEP_ID:           z.string().optional(),
  CHAINLINK_SECRETS_VERSION:     z.string().optional(),

  // Hedera
  HEDERA_OPERATOR_ID:  z.string().optional(),
  HEDERA_OPERATOR_KEY: z.string().optional(),
  HCS_CREDIT_TOPIC_ID: z.string().optional(),
  HCS_INTENT_TOPIC_ID: z.string().optional(),
  HTS_CREDIT_TOKEN_ID: z.string().optional(),

  // APIs
  GROQ_API_KEY:   z.string().optional(),
  PINATA_JWT:     z.string().optional(),
  PINATA_GATEWAY: z.string().default("https://gateway.pinata.cloud"),
  PHALA_ENDPOINT: z.string().optional(),

  // ZK
  ZK_WASM_PATH: z.string().default("./zk/CreditScore_js/CreditScore.wasm"),
  ZK_ZKEY_PATH: z.string().default("./zk/CreditScore_final.zkey"),
  ZK_VKEY_PATH: z.string().default("./zk/verification_key.json"),
})

function parseEnv() {
  const result = EnvSchema.safeParse(process.env)
  if (!result.success) {
    console.error("\n❌  Invalid environment variables:\n")
    result.error.issues.forEach(issue => {
      console.error(`   ${issue.path.join(".")} — ${issue.message}`)
    })
    console.error("\n   Copy .env.example to .env and fill in all required values.\n")
    process.exit(1)
  }
  return result.data
}

export const env = parseEnv()
export type Env  = typeof env