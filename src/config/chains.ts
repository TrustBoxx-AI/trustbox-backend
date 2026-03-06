/* config/chains.ts — TrustBox
   On-chain addresses and ABI loaders.
   Mirrors frontend constants/chains.js — kept in sync.
   ─────────────────────────────────────────────────── */

import { env } from "./env";

export const FUJI = {
  chainId:  43113,
  name:     "Avalanche Fuji Testnet",
  rpcUrl:   env.AVALANCHE_FUJI_RPC,
  symbol:   "AVAX",
  explorer: "https://testnet.snowtrace.io",
};

export const CHAINLINK = {
  subscriptionId:      env.CHAINLINK_SUBSCRIPTION_ID ? Number(env.CHAINLINK_SUBSCRIPTION_ID) : null,
  donId:               env.CHAINLINK_DON_ID,
  routerAddress:       env.CHAINLINK_ROUTER,
  linkToken:           env.CHAINLINK_LINK_TOKEN,
  automationRegistry:  env.CHAINLINK_AUTOMATION_REGISTRY,
  upkeepId:            env.CHAINLINK_UPKEEP_ID ?? null,
  secretsVersion:      env.CHAINLINK_SECRETS_VERSION ? Number(env.CHAINLINK_SECRETS_VERSION) : null,

  // Price feeds on Fuji (8 decimal places)
  priceFeeds: {
    avaxUsd: "0x5498BB86BC934c8D34FDA08E81D444153d0D06aD",
    ethUsd:  "0x86d67c3D38D2bCeE722E601025C25a575021c6EA",
    btcUsd:  "0x31CF013A08c6Ac228C94551d535d5BAfE19c602a",
  },
};

export const CONTRACTS = {
  trustRegistry:    env.TRUST_REGISTRY_ADDR    ?? null,
  auditRegistry:    env.AUDIT_REGISTRY_ADDR    ?? null,
  agentMarketplace: env.AGENT_MARKETPLACE_ADDR ?? null,
  intentVault:      env.INTENT_VAULT_ADDR      ?? null,
  functionsConsumer:env.FUNCTIONS_CONSUMER_ADDR ?? null,
};

export const HEDERA_CONFIG = {
  network:       "testnet" as const,
  operatorId:    env.HEDERA_OPERATOR_ID    ?? null,
  operatorKey:   env.HEDERA_OPERATOR_KEY   ?? null,
  topics: {
    creditScore:     env.HCS_CREDIT_TOPIC_ID ?? null,
    intentExecution: env.HCS_INTENT_TOPIC_ID ?? null,
  },
  tokens: {
    creditNFT: env.HTS_CREDIT_TOKEN_ID ?? null,
  },
  explorer: "https://hashscan.io/testnet",
  mirrorNode: "https://testnet.mirrornode.hedera.com",
};

// ── Staleness guards ─────────────────────────────────────────
export const PRICE_STALENESS_SECONDS = 3600; // 1 hour

// ── ABI loaders (filled by scripts/utils/exportAbis.ts) ──────
export function loadAbi(contractName: string): any[] {
  try {
    return require(`../contracts/abis/${contractName}.json`);
  } catch {
    // Return minimal placeholder if not yet deployed
    console.warn(`⚠  ABI not found for ${contractName} — deploy contracts first (Session 5)`);
    return [];
  }
}
