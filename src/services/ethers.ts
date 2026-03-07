/* services/ethers.ts — TrustBox
   Shared ethers.js v6 provider, signer, and contract instances.
   All on-chain reads/writes go through this module.
   ─────────────────────────────────────────────────────────── */

import { ethers } from "ethers";
import { env }     from "../config/env";
import { CONTRACTS, loadAbi } from "../config/chains";

// ── Shared provider + signer ──────────────────────────────────
// Pass chainId as a number and staticNetwork: true to prevent
// ethers v6 from attempting ENS resolution on Avalanche Fuji.
export const provider = new ethers.JsonRpcProvider(
  env.AVALANCHE_FUJI_RPC,
  43113,            // chainId — tells ethers this is NOT mainnet, skip ENS
  { staticNetwork: true }   // ← never auto-detect, never call ENS
);

export const signer = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);

// ── Helper — get gas price with bump ─────────────────────────
export async function getGasConfig() {
  const feeData = await provider.getFeeData();
  return {
    maxFeePerGas:         feeData.maxFeePerGas         ?? ethers.parseUnits("30", "gwei"),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? ethers.parseUnits("2",  "gwei"),
  };
}

// ── Contract factories ────────────────────────────────────────
function contract(name: string, address: string | null) {
  if (!address) {
    throw new Error(`Contract ${name} not deployed yet — run 'npm run deploy:fuji' (Session 5)`);
  }
  const abi = loadAbi(name);
  return new ethers.Contract(address, abi, signer);
}

export function getTrustRegistry()     { return contract("TrustRegistry",     CONTRACTS.trustRegistry);     }
export function getAuditRegistry()     { return contract("AuditRegistry",     CONTRACTS.auditRegistry);     }
export function getAgentMarketplace()  { return contract("AgentMarketplace",  CONTRACTS.agentMarketplace);  }
export function getIntentVault()       { return contract("IntentVault",       CONTRACTS.intentVault);       }
export function getFunctionsConsumer() { return contract("FunctionsConsumer", CONTRACTS.functionsConsumer); }

// ── AggregatorV3Interface — price feeds ──────────────────────
const AGGREGATOR_ABI = [
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() external view returns (uint8)",
];

export function getPriceFeed(address: string) {
  return new ethers.Contract(address, AGGREGATOR_ABI, provider);
}

// ── Wait for tx with timeout ─────────────────────────────────
export async function waitForTx(
  tx: ethers.TransactionResponse,
  confirmations = 1,
  timeoutMs = 60_000
): Promise<ethers.TransactionReceipt> {
  const receipt = await Promise.race([
    tx.wait(confirmations),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Transaction timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
  if (!receipt) throw new Error("Transaction receipt is null");
  return receipt;
}

// ── Event listener with timeout ──────────────────────────────
export function waitForEvent<T>(
  contract: ethers.Contract,
  eventName: string,
  timeoutMs = 90_000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      contract.off(eventName, handler);
      reject(new Error(`Event '${eventName}' timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const handler = (...args: any[]) => {
      clearTimeout(timeout);
      contract.off(eventName, handler);
      resolve(args as unknown as T);
    };

    contract.on(eventName, handler);
  });
}

// ── getIntentFromTx — read IntentSubmitted event from receipt ─
// Used by CRE Workflow 1 to hydrate intent data from a tx hash.
export async function getIntentFromTx(txHash: string): Promise<{
  intentId:  string;
  submitter: string;
  nlHash:    string;
  specHash:  string;
  spec:      string;
  category:  string;
  sig:       string;
} | null> {
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return null;

    const vault = getIntentVault();
    for (const log of receipt.logs) {
      try {
        const parsed = vault.interface.parseLog(log);
        if (parsed?.name === "IntentSubmitted") {
          const { intentId, submitter, nlHash, specHash, spec, category, sig } = parsed.args;
          return {
            intentId:  intentId.toString(),
            submitter: submitter as string,
            nlHash:    nlHash    as string,
            specHash:  specHash  as string,
            spec:      spec      as string,
            category:  category  as string,
            sig:       sig       as string,
          };
        }
      } catch { /* skip non-matching logs */ }
    }
    return null;
  } catch (err: any) {
    console.warn("[ethers] getIntentFromTx failed:", err.message);
    return null;
  }
}

// ── markIntentExecuted — write execution result back to vault ─
// Used by CRE Workflow 1 after off-chain execution completes.
export async function markIntentExecuted(params: {
  intentId:      string;
  executionHash: string;
  resultCID:     string;
}): Promise<ethers.TransactionReceipt> {
  const vault     = getIntentVault();
  const gasConfig = await getGasConfig();
  const tx = await vault.markExecuted(
    params.intentId,
    params.executionHash,
    params.resultCID,
    { ...gasConfig }
  );
  return waitForTx(tx);
}

// ── getAgentRecord — read AgentRecord struct from TrustRegistry
// Used by TEE probe to get current trust score before updating.
export async function getAgentRecord(tokenId: number): Promise<{
  agentId:        string;
  modelHash:      string;
  operator:       string;
  capabilityHash: string;
  metadataURI:    string;
  trustScore:     number;
  mintedAt:       number;
  isRevoked:      boolean;
} | null> {
  try {
    const registry = getTrustRegistry();
    const rec = await registry.verifyAgent(tokenId);
    return {
      agentId:        rec.agentId        as string,
      modelHash:      rec.modelHash      as string,
      operator:       rec.operator       as string,
      capabilityHash: rec.capabilityHash as string,
      metadataURI:    rec.metadataURI    as string,
      trustScore:     Number(rec.trustScore),
      mintedAt:       Number(rec.mintedAt),
      isRevoked:      rec.isRevoked      as boolean,
    };
  } catch (err: any) {
    console.warn("[ethers] getAgentRecord failed:", err.message);
    return null;
  }
}

// ── updateAgentScore — call TrustRegistry.updateScore() ───────
// Used by TEE probe (Workflow 3) after liveness + behaviour check.
export async function updateAgentScore(
  tokenId: number,
  newScore: number,
  reason:  string
): Promise<ethers.TransactionReceipt> {
  const registry  = getTrustRegistry();
  const gasConfig = await getGasConfig();
  const tx = await registry.updateScore(tokenId, newScore, reason, { ...gasConfig });
  return waitForTx(tx);
}