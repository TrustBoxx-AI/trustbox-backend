/* services/ethers.ts — TrustBox
   Shared ethers.js v6 provider, signer, and typed contract instances.
   All on-chain reads/writes go through this module.
   ─────────────────────────────────────────────────────────────────── */

import { ethers }              from "ethers"
import { env }                 from "../config/env"
import { CONTRACTS, loadAbi }  from "../config/chains"

// ── Shared provider + signer ──────────────────────────────────
export const provider = new ethers.JsonRpcProvider(env.AVALANCHE_FUJI_RPC)
export const signer   = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider)

// ── Gas config helper ─────────────────────────────────────────
export async function getGasConfig() {
  const feeData = await provider.getFeeData()
  return {
    maxFeePerGas:         feeData.maxFeePerGas         ?? ethers.parseUnits("30", "gwei"),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? ethers.parseUnits("2",  "gwei"),
  }
}

// ── Contract factory ──────────────────────────────────────────
function contract(name: string, address: string | null) {
  if (!address) {
    throw new Error(`Contract ${name} not deployed — run 'npm run deploy:fuji'`)
  }
  return new ethers.Contract(address, loadAbi(name), signer)
}

// ── Contract instances ────────────────────────────────────────
export function getTrustRegistry()     { return contract("TrustRegistry",     CONTRACTS.trustRegistry)     }
export function getAuditRegistry()     { return contract("AuditRegistry",     CONTRACTS.auditRegistry)     }
export function getAgentMarketplace()  { return contract("AgentMarketplace",  CONTRACTS.agentMarketplace)  }
export function getIntentVault()       { return contract("IntentVault",       CONTRACTS.intentVault)       }
export function getFunctionsConsumer() { return contract("FunctionsConsumer", CONTRACTS.functionsConsumer) }

// Named exports for proof.ts compatibility
export const trustRegistry    = getTrustRegistry
export const auditRegistry    = getAuditRegistry
export const intentVault      = getIntentVault

// ── Price feed ────────────────────────────────────────────────
const AGGREGATOR_ABI = [
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() external view returns (uint8)",
]

export function getPriceFeed(address: string) {
  return new ethers.Contract(address, AGGREGATOR_ABI, provider)
}

// ── TrustRegistry helpers ─────────────────────────────────────

export async function mintAgentCredential(params: {
  agentId:       string
  modelHash:     string
  operator:      string
  capabilityHash:string
  metadataURI:   string
}): Promise<{ tokenId: string; txHash: string }> {
  const registry  = getTrustRegistry()
  const gasConfig = await getGasConfig()

  const tx = await registry.mintCredential(
    params.agentId,
    params.modelHash,
    params.operator,
    params.capabilityHash,
    params.metadataURI,
    { ...gasConfig }
  )

  const receipt = await waitForTx(tx)
  let tokenId   = "0"

  for (const log of receipt.logs) {
    try {
      const parsed = registry.interface.parseLog(log)
      if (parsed?.name === "AgentRegistered") {
        tokenId = parsed.args.tokenId.toString()
      }
    } catch { /* skip */ }
  }

  return { tokenId, txHash: receipt.hash }
}

export async function updateAgentScore(
  tokenId: number,
  newScore: number,
  reason:  string
): Promise<string> {
  const registry  = getTrustRegistry()
  const gasConfig = await getGasConfig()
  const tx        = await registry.updateScore(tokenId, newScore, reason, { ...gasConfig })
  const receipt   = await waitForTx(tx)
  return receipt.hash
}

export async function getAgentRecord(tokenId: number) {
  const registry = getTrustRegistry()
  return registry.verifyAgent(BigInt(tokenId))
}

// ── AuditRegistry helpers ─────────────────────────────────────

export async function submitAuditRecord(params: {
  contractAddr: string
  reportHash:   string
  merkleRoot:   string
  reportCID:    string
  auditorSig:   string
  score:        number
}): Promise<{ auditId: string; txHash: string }> {
  const registry  = getAuditRegistry()
  const gasConfig = await getGasConfig()

  const tx = await registry.submitAudit(
    params.contractAddr,
    params.reportHash,
    params.merkleRoot,
    params.reportCID,
    params.auditorSig,
    params.score,
    { ...gasConfig }
  )

  const receipt = await waitForTx(tx)
  let auditId   = "0"

  for (const log of receipt.logs) {
    try {
      const parsed = registry.interface.parseLog(log)
      if (parsed?.name === "AuditSubmitted") {
        auditId = parsed.args.auditId.toString()
      }
    } catch { /* skip */ }
  }

  return { auditId, txHash: receipt.hash }
}

export async function getAuditRecord(contractAddr: string) {
  const registry = getAuditRegistry()
  return registry.getAudit(contractAddr)
}

// ── IntentVault helpers ───────────────────────────────────────

export async function submitIntentOnChain(params: {
  spec:      string
  signature: string
}): Promise<{ intentId: string; txHash: string }> {
  const vault     = getIntentVault()
  const gasConfig = await getGasConfig()

  const tx = await vault.submitIntent(
    params.spec,
    params.signature,
    { ...gasConfig }
  )

  const receipt  = await waitForTx(tx)
  let intentId   = ""

  for (const log of receipt.logs) {
    try {
      const parsed = vault.interface.parseLog(log)
      if (parsed?.name === "IntentSubmitted") {
        intentId = parsed.args.intentId
      }
    } catch { /* skip */ }
  }

  return { intentId, txHash: receipt.hash }
}

export async function markIntentExecuted(params: {
  intentId:  string
  success:   boolean
  resultCID: string
  executor:  string
}): Promise<string> {
  const vault     = getIntentVault()
  const gasConfig = await getGasConfig()

  const tx = await vault.markExecuted(
    params.intentId,
    params.success,
    params.resultCID,
    { ...gasConfig }
  )

  const receipt = await waitForTx(tx)
  return receipt.hash
}

export async function getIntentRecord(intentId: string) {
  const vault = getIntentVault()
  return vault.getIntent(intentId)
}

export async function getIntentFromTx(txHash: string): Promise<{
  intentId:  string
  submitter: string
  spec:      string
} | null> {
  const vault   = getIntentVault()
  const receipt = await provider.getTransactionReceipt(txHash)
  if (!receipt) return null

  for (const log of receipt.logs) {
    try {
      const parsed = vault.interface.parseLog(log)
      if (parsed?.name === "IntentSubmitted") {
        return {
          intentId:  parsed.args.intentId,
          submitter: parsed.args.submitter,
          spec:      parsed.args.spec,
        }
      }
    } catch { /* skip */ }
  }
  return null
}

// ── AgentMarketplace helpers ──────────────────────────────────

export async function getActiveAgents(): Promise<{
  agentId:     string
  operator:    string
  teeEndpoint: string
  stake:       string
  score:       number
  tokenId:     number
}[]> {
  // TODO: add agentCount() + getAgentByIndex() to AgentMarketplace.sol
  // For now returns empty — API falls back to seed data
  return []
}

// ── Tx helpers ────────────────────────────────────────────────

export async function waitForTx(
  tx:             ethers.TransactionResponse,
  confirmations = 1,
  timeoutMs     = 60_000
): Promise<ethers.TransactionReceipt> {
  const receipt = await Promise.race([
    tx.wait(confirmations),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Transaction timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ])
  if (!receipt) throw new Error("Transaction receipt is null")
  return receipt
}

export function waitForEvent<T>(
  contract:  ethers.Contract,
  eventName: string,
  timeoutMs = 90_000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      contract.off(eventName, handler)
      reject(new Error(`Event '${eventName}' timeout after ${timeoutMs}ms`))
    }, timeoutMs)

    const handler = (...args: any[]) => {
      clearTimeout(timeout)
      contract.off(eventName, handler)
      resolve(args as unknown as T)
    }

    contract.on(eventName, handler)
  })
}