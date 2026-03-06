/* config/chains.ts — TrustBox
   On-chain addresses, chain config, and inlined ABIs.
   ABIs are inlined here so they survive the tsc → dist/ build
   without needing a separate copy step.
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
  explorer:   "https://hashscan.io/testnet",
  mirrorNode: "https://testnet.mirrornode.hedera.com",
};

export const PRICE_STALENESS_SECONDS = 3600;

// ── Inlined ABIs ──────────────────────────────────────────────
// Inlining avoids the dist/ copy problem — tsc bundles these as
// plain JS objects so they're always available at runtime.

const ABIS: Record<string, any[]> = {

  TrustRegistry: [
    {"inputs":[],"stateMutability":"nonpayable","type":"constructor"},
    {"inputs":[{"internalType":"string","name":"agentId","type":"string"},{"internalType":"bytes32","name":"modelHash","type":"bytes32"},{"internalType":"address","name":"operator","type":"address"},{"internalType":"bytes32","name":"capabilityHash","type":"bytes32"},{"internalType":"string","name":"metadataURI","type":"string"}],"name":"mintCredential","outputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"verifyAgent","outputs":[{"components":[{"internalType":"string","name":"agentId","type":"string"},{"internalType":"bytes32","name":"modelHash","type":"bytes32"},{"internalType":"address","name":"operator","type":"address"},{"internalType":"bytes32","name":"capabilityHash","type":"bytes32"},{"internalType":"string","name":"metadataURI","type":"string"},{"internalType":"uint256","name":"trustScore","type":"uint256"},{"internalType":"uint256","name":"mintedAt","type":"uint256"},{"internalType":"bool","name":"isRevoked","type":"bool"}],"internalType":"struct IERC8004.AgentRecord","name":"","type":"tuple"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"},{"internalType":"uint256","name":"newScore","type":"uint256"},{"internalType":"string","name":"reason","type":"string"}],"name":"updateScore","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"},{"internalType":"string","name":"reason","type":"string"}],"name":"revokeCredential","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"operator","type":"address"}],"name":"getAgentsByOperator","outputs":[{"internalType":"uint256[]","name":"","type":"uint256[]"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"string","name":"agentId","type":"string"},{"internalType":"address","name":"operator","type":"address"}],"name":"isRegistered","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"tokenId","type":"uint256"},{"indexed":true,"internalType":"string","name":"agentId","type":"string"},{"indexed":true,"internalType":"address","name":"operator","type":"address"},{"indexed":false,"internalType":"bytes32","name":"modelHash","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"trustScore","type":"uint256"}],"name":"AgentRegistered","type":"event"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"tokenId","type":"uint256"},{"indexed":false,"internalType":"string","name":"reason","type":"string"}],"name":"CredentialRevoked","type":"event"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"tokenId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"oldScore","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"newScore","type":"uint256"},{"indexed":false,"internalType":"string","name":"reason","type":"string"}],"name":"ScoreUpdated","type":"event"},
  ],

  AuditRegistry: [
    {"inputs":[{"internalType":"address","name":"contractAddr","type":"address"},{"internalType":"bytes32","name":"reportHash","type":"bytes32"},{"internalType":"bytes32","name":"merkleRoot","type":"bytes32"},{"internalType":"string","name":"reportCID","type":"string"},{"internalType":"bytes","name":"auditorSig","type":"bytes"},{"internalType":"uint256","name":"score","type":"uint256"}],"name":"submitAudit","outputs":[{"internalType":"uint256","name":"auditId","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"contractAddr","type":"address"}],"name":"getAudit","outputs":[{"components":[{"internalType":"uint256","name":"auditId","type":"uint256"},{"internalType":"address","name":"contractAddr","type":"address"},{"internalType":"bytes32","name":"reportHash","type":"bytes32"},{"internalType":"bytes32","name":"merkleRoot","type":"bytes32"},{"internalType":"string","name":"reportCID","type":"string"},{"internalType":"address","name":"auditor","type":"address"},{"internalType":"uint256","name":"timestamp","type":"uint256"},{"internalType":"uint256","name":"blockNumber","type":"uint256"},{"internalType":"uint256","name":"score","type":"uint256"}],"internalType":"struct AuditRecord","name":"","type":"tuple"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"contractAddr","type":"address"}],"name":"getAuditHistory","outputs":[{"components":[{"internalType":"uint256","name":"auditId","type":"uint256"},{"internalType":"address","name":"contractAddr","type":"address"},{"internalType":"bytes32","name":"reportHash","type":"bytes32"},{"internalType":"bytes32","name":"merkleRoot","type":"bytes32"},{"internalType":"string","name":"reportCID","type":"string"},{"internalType":"address","name":"auditor","type":"address"},{"internalType":"uint256","name":"timestamp","type":"uint256"},{"internalType":"uint256","name":"blockNumber","type":"uint256"},{"internalType":"uint256","name":"score","type":"uint256"}],"internalType":"struct AuditRecord[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"contractAddr","type":"address"},{"internalType":"bytes32","name":"reportHash","type":"bytes32"}],"name":"verifyReport","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"totalAudits","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"auditor","type":"address"}],"name":"addAuditor","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"auditor","type":"address"}],"name":"removeAuditor","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"auditId","type":"uint256"},{"indexed":true,"internalType":"address","name":"contractAddr","type":"address"},{"indexed":false,"internalType":"bytes32","name":"reportHash","type":"bytes32"},{"indexed":false,"internalType":"bytes32","name":"merkleRoot","type":"bytes32"},{"indexed":false,"internalType":"string","name":"reportCID","type":"string"},{"indexed":false,"internalType":"address","name":"auditor","type":"address"},{"indexed":false,"internalType":"uint256","name":"score","type":"uint256"}],"name":"AuditSubmitted","type":"event"},
  ],

  AgentMarketplace: [
    {"inputs":[{"internalType":"string","name":"agentId","type":"string"},{"internalType":"string","name":"name","type":"string"},{"internalType":"string","name":"teeEndpoint","type":"string"},{"internalType":"uint256","name":"stakeAmount","type":"uint256"}],"name":"registerAgent","outputs":[],"stateMutability":"payable","type":"function"},
    {"inputs":[{"internalType":"string","name":"agentId","type":"string"}],"name":"getAgent","outputs":[{"components":[{"internalType":"string","name":"agentId","type":"string"},{"internalType":"string","name":"name","type":"string"},{"internalType":"address","name":"operator","type":"address"},{"internalType":"string","name":"teeEndpoint","type":"string"},{"internalType":"uint256","name":"stakeAmount","type":"uint256"},{"internalType":"uint256","name":"trustScore","type":"uint256"},{"internalType":"bool","name":"isSlashed","type":"bool"},{"internalType":"bool","name":"isActive","type":"bool"}],"internalType":"struct AgentRecord","name":"","type":"tuple"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"string","name":"agentId","type":"string"},{"internalType":"string","name":"bundleCID","type":"string"},{"internalType":"address","name":"requester","type":"address"}],"name":"requestJob","outputs":[{"internalType":"uint256","name":"jobId","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"jobId","type":"uint256"},{"internalType":"string","name":"resultCID","type":"string"},{"internalType":"bytes","name":"attestation","type":"bytes"}],"name":"completeJob","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"string","name":"agentId","type":"string"},{"internalType":"string","name":"reason","type":"string"}],"name":"slashAgent","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[],"name":"getActiveAgents","outputs":[{"internalType":"string[]","name":"","type":"string[]"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"string","name":"agentId","type":"string"},{"indexed":true,"internalType":"address","name":"operator","type":"address"},{"indexed":false,"internalType":"uint256","name":"stakeAmount","type":"uint256"}],"name":"AgentRegistered","type":"event"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"jobId","type":"uint256"},{"indexed":true,"internalType":"string","name":"agentId","type":"string"},{"indexed":true,"internalType":"address","name":"requester","type":"address"},{"indexed":false,"internalType":"string","name":"bundleCID","type":"string"}],"name":"JobCreated","type":"event"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"jobId","type":"uint256"},{"indexed":false,"internalType":"string","name":"resultCID","type":"string"},{"indexed":false,"internalType":"bytes","name":"attestation","type":"bytes"}],"name":"JobComplete","type":"event"},
  ],

  IntentVault: [
    {"inputs":[{"internalType":"bytes32","name":"nlHash","type":"bytes32"},{"internalType":"bytes32","name":"specHash","type":"bytes32"},{"internalType":"string","name":"specJson","type":"string"},{"internalType":"bytes","name":"signature","type":"bytes"},{"internalType":"string","name":"category","type":"string"}],"name":"submitIntent","outputs":[{"internalType":"uint256","name":"intentId","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"intentId","type":"uint256"},{"internalType":"string","name":"txHash","type":"string"}],"name":"markExecuted","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"intentId","type":"uint256"}],"name":"getIntent","outputs":[{"components":[{"internalType":"uint256","name":"intentId","type":"uint256"},{"internalType":"address","name":"submitter","type":"address"},{"internalType":"bytes32","name":"nlHash","type":"bytes32"},{"internalType":"bytes32","name":"specHash","type":"bytes32"},{"internalType":"string","name":"specJson","type":"string"},{"internalType":"string","name":"category","type":"string"},{"internalType":"uint256","name":"timestamp","type":"uint256"},{"internalType":"bool","name":"executed","type":"bool"},{"internalType":"string","name":"txHash","type":"string"}],"internalType":"struct IntentRecord","name":"","type":"tuple"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"submitter","type":"address"}],"name":"getIntentsBySubmitter","outputs":[{"internalType":"uint256[]","name":"","type":"uint256[]"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"totalIntents","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"intentId","type":"uint256"},{"indexed":true,"internalType":"address","name":"submitter","type":"address"},{"indexed":false,"internalType":"bytes32","name":"specHash","type":"bytes32"},{"indexed":false,"internalType":"string","name":"category","type":"string"}],"name":"IntentSubmitted","type":"event"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"intentId","type":"uint256"},{"indexed":false,"internalType":"string","name":"txHash","type":"string"}],"name":"IntentExecuted","type":"event"},
  ],
};

// ── ABI loader ────────────────────────────────────────────────
export function loadAbi(contractName: string): any[] {
  const abi = ABIS[contractName];
  if (!abi) {
    console.warn(`⚠  ABI not found for ${contractName} — deploy contracts first (Session 5)`);
    return [];
  }
  return abi;
}