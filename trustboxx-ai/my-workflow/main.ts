/**
 * TrustBox AI — CRE Workflow (Custom Data Feed TS)
 * ================================================
 * Workflow 1: Intent Execution  — EVM log trigger
 * Workflow 2: Credit Score      — cron trigger (every 6h)
 * Workflow 3: Agent Trust Score — cron trigger (every 2h)
 */

import {
  EVMClient,
  HTTPClient,
  CronCapability,
  consensusIdenticalAggregation,
  Runner,
  handler,
  json,
  type Runtime,
  type EVMLog,
  type CronPayload,
} from '@chainlink/cre-sdk'

// log is a global provided by the CRE WASM runtime — NOT an SDK export
declare function log(msg: string): void

import type { TrustBoxConfig } from './types'

// ─── Capability clients ───────────────────────────────────────
const FUJI            = EVMClient.SUPPORTED_CHAIN_SELECTORS['avalanche-testnet-fuji']
const evmClient       = new EVMClient(FUJI)
const httpClient      = new HTTPClient()

// Note: Tenderly VTN price feed reads happen server-side in price.ts (Express).
// EVMClient only supports CRE SUPPORTED_CHAIN_SELECTORS — custom VTN chain IDs
// are not in that list and cause WASM to crash at subscribe time if instantiated here.

// ─── Types ────────────────────────────────────────────────────
interface IntentSpec {
  action: string
  entity: string
  params: Record<string, unknown>
}

interface ExecResult {
  intentId:  string
  success:   boolean
  resultCID: string
}

interface ScoreResult {
  refreshed: number
  total:     number
}

interface AgentResult {
  scanned: number
  updated: number
}

interface PriceFeedResult {
  avaxUsd:      number    // price in USD from Avalanche VTN
  ethUsdAvax:   number    // ETH/USD from Avalanche VTN
  ethUsdEth:    number    // ETH/USD from Ethereum VTN (cross-chain verify)
  deviation:    number    // % deviation between two ETH/USD sources
  verified:     boolean   // true if deviation < 0.5%
  timestamp:    string
  blockAvax:    number
  blockEth:     number
}

// ─── JSON headers ─────────────────────────────────────────────
const jsonHeaders = {
  'Content-Type': { values: ['application/json'] },
}

// ═══════════════════════════════════════════════════════════════
// Workflow 1: Intent Execution (EVM Log Trigger)
// ═══════════════════════════════════════════════════════════════
const executeIntentHandler = handler(
  evmClient.logTrigger({
    addresses: ['0xa39BD8F5Fb7CA64BFD3632A43C7bBBE6D4152129'], // IntentVault on Tenderly VTN
    topics: [{ values: ['0xd9d4926cf0a81744b3d4e9b34db19b1ce3b3ff1eae30c36edadce6b20e01c0d1'] }],
  }),
  (runtime: Runtime<TrustBoxConfig>, _triggerLog: EVMLog): ExecResult => {

    const result = runtime.runInNodeMode(
      (nodeRuntime): ExecResult => {
        const apiUrl = runtime.config.apiUrl

        // 1. Fetch latest pending intent
        const intentRes = httpClient.sendRequest(nodeRuntime, {
          url:    `${apiUrl}/api/intent/pending`,
          method: 'GET',
        })

        const intent = json(intentRes.result()) as { intentId: string; spec: IntentSpec }
        log(`[TrustBox] Executing: ${intent.spec.action}`)

        // 2. Execute intent
        const execRes = httpClient.sendRequest(nodeRuntime, {
          url:          `${apiUrl}/api/intent/execute`,
          method:       'POST',
          multiHeaders: jsonHeaders,
          body:         Buffer.from(JSON.stringify({
            intentId: intent.intentId,
            action:   intent.spec.action,
            params:   intent.spec.params,
          })).toString('base64'),
        })

        const execResult = json(execRes.result()) as ExecResult
        log(`[TrustBox] Done: success=${execResult.success} CID=${execResult.resultCID}`)

        return execResult
      },
      consensusIdenticalAggregation<ExecResult>(),
    )().result()

    // 3. Write result on-chain
    const reportResult = runtime.report({
      encodedPayload: Buffer.from(JSON.stringify(result)).toString('base64'),
      encoderName:    'evm',
      hashingAlgo:    'Keccak256',
    }).result()

    evmClient.writeReport(runtime, {
      receiver: runtime.config.contracts.intentVault,
      report:   reportResult,
    })

    return result
  }
)

// ═══════════════════════════════════════════════════════════════
// Workflow 2: Credit Score Refresh (Cron every 6h)
// ═══════════════════════════════════════════════════════════════
const refreshCreditScoresHandler = handler(
  new CronCapability().trigger({ schedule: '0 */6 * * *' }),
  (runtime: Runtime<TrustBoxConfig>, _cron: CronPayload): ScoreResult => {
    log('[TrustBox] Credit score cron fired')

    return runtime.runInNodeMode(
      (nodeRuntime): ScoreResult => {
        const apiUrl = runtime.config.apiUrl

        // 1. Fetch pending entities
        const pendingRes = httpClient.sendRequest(nodeRuntime, {
          url:    `${apiUrl}/api/score/pending`,
          method: 'GET',
        })

        const raw = json(pendingRes.result()) as any
        const pending: { entityId: string; paymentHistoryUrl: string }[] =
          Array.isArray(raw) ? raw : (raw?.pending ?? [])

        log(`[TrustBox] ${pending.length} entities pending score refresh`)

        if (pending.length === 0) {
          return { refreshed: 0, total: 0 }
        }

        let refreshed = 0

        for (const entity of pending) {
          // 2. Fetch payment history
          const histRes = httpClient.sendRequest(nodeRuntime, {
            url:    entity.paymentHistoryUrl,
            method: 'GET',
          })

          // 3. Compute score + anchor to Hedera HCS
          const scoreRes = httpClient.sendRequest(nodeRuntime, {
            url:          `${apiUrl}/api/score/compute-and-anchor`,
            method:       'POST',
            multiHeaders: jsonHeaders,
            body:         Buffer.from(JSON.stringify({
              entityId:      entity.entityId,
              history:       json(histRes.result()),
              hederaTopicId: runtime.config.hedera.topicId,
            })).toString('base64'),
          })

          const { score, hcsMessageId } = json(scoreRes.result()) as {
            score:        number
            hcsMessageId: string
          }

          log(`[TrustBox] ${entity.entityId} = ${score} | HCS: ${hcsMessageId}`)
          refreshed++
        }

        log(`[TrustBox] Credit scores done: ${refreshed}/${pending.length}`)
        return { refreshed, total: pending.length }
      },
      consensusIdenticalAggregation<ScoreResult>(),
    )().result()
  }
)

// ═══════════════════════════════════════════════════════════════
// Workflow 3: Agent Trust Score (Cron every 2h)
// ═══════════════════════════════════════════════════════════════
const refreshAgentScoresHandler = handler(
  new CronCapability().trigger({ schedule: '0 */2 * * *' }),
  (runtime: Runtime<TrustBoxConfig>, _cron: CronPayload): AgentResult => {
    log('[TrustBox] Agent trust score cron fired')

    return runtime.runInNodeMode(
      (nodeRuntime): AgentResult => {
        const apiUrl = runtime.config.apiUrl

        // 1. Fetch active agents
        const agentsRes = httpClient.sendRequest(nodeRuntime, {
          url:    `${apiUrl}/api/agents/active`,
          method: 'GET',
        })

        const raw = json(agentsRes.result()) as any
        const agents: { agentId: string; tokenId: number; teeEndpoint: string }[] =
          Array.isArray(raw) ? raw : (raw?.agents ?? [])

        log(`[TrustBox] Scanning ${agents.length} agents`)

        if (agents.length === 0) {
          return { scanned: 0, updated: 0 }
        }

        let updated = 0

        for (const agent of agents) {
          // 2. Probe TEE + compute new trust score
          const probeRes = httpClient.sendRequest(nodeRuntime, {
            url:          `${apiUrl}/api/tee/probe-and-update`,
            method:       'POST',
            multiHeaders: jsonHeaders,
            body:         Buffer.from(JSON.stringify({
              agentId:      agent.agentId,
              tokenId:      agent.tokenId,
              teeEndpoint:  agent.teeEndpoint,
              contractAddr: runtime.config.contracts.trustRegistry,
            })).toString('base64'),
          })

          const { newScore, changed } = json(probeRes.result()) as {
            newScore: number
            changed:  boolean
          }

          if (changed) {
            log(`[TrustBox] ${agent.agentId} → ${newScore}`)
            updated++
          }
        }

        log(`[TrustBox] Agent scores done: ${updated}/${agents.length}`)
        return { scanned: agents.length, updated }
      },
      consensusIdenticalAggregation<AgentResult>(),
    )().result()
  }
)

// ═══════════════════════════════════════════════════════════════
// Workflow 4: Cross-Chain Price Feed Verification (Cron every 15min)
// ═══════════════════════════════════════════════════════════════
// Runs on Tenderly Virtual TestNets forked from real mainnet.
//
// Reads ETH/USD from two independent Chainlink feeds:
//   Source A: Avalanche mainnet fork (VTN-AVAX) — feed 0x976B3D...
//   Source B: Ethereum mainnet fork  (VTN-ETH)  — feed 0x5f4eC3...
//
// If deviation < 0.5% → writes a "VERIFIED" composite price on-chain
// If deviation ≥ 0.5% → raises a price anomaly alert (writes alert payload)
//
// This demonstrates:
//   • CRE orchestrating across two independent Tenderly VTNs
//   • Real mainnet Chainlink price feed data (not fake testnet data)
//   • Cross-chain verification before writing a custom data feed on-chain
//   • Tenderly tx debugger shows full trace of both feed reads + write
const verifyPriceFeedsHandler = handler(
  new CronCapability().trigger({ schedule: '*/15 * * * *' }),
  (runtime: Runtime<TrustBoxConfig>, _cron: CronPayload): PriceFeedResult => {
    log('[TrustBox] Price feed verification cron fired')

    return runtime.runInNodeMode(
      (nodeRuntime): PriceFeedResult => {
        const apiUrl = runtime.config.apiUrl

        // 1. Read AVAX/USD and ETH/USD from Avalanche VTN (mainnet fork)
        //    Uses the backend /api/price endpoint which calls getPriceFeed()
        //    from services/ethers.ts against the TENDERLY_AVAX_RPC
        const avaxPriceRes = httpClient.sendRequest(nodeRuntime, {
          url:    `${apiUrl}/api/price/avax-vtn`,
          method: 'GET',
        })
        const avaxData = json(avaxPriceRes.result()) as {
          avaxUsd: number; ethUsd: number; blockNumber: number; source: string
        }
        log(`[TrustBox] VTN-AVAX → AVAX/USD: $${avaxData.avaxUsd} | ETH/USD: $${avaxData.ethUsd}`)

        // 2. Read ETH/USD from Ethereum VTN (independent mainnet fork)
        //    Cross-chain read — completely separate fork, separate price feed
        const ethPriceRes = httpClient.sendRequest(nodeRuntime, {
          url:    `${apiUrl}/api/price/eth-vtn`,
          method: 'GET',
        })
        const ethData = json(ethPriceRes.result()) as {
          ethUsd: number; blockNumber: number; source: string
        }
        log(`[TrustBox] VTN-ETH  → ETH/USD: $${ethData.ethUsd}`)

        // 3. Cross-chain deviation check
        const deviation = Math.abs(avaxData.ethUsd - ethData.ethUsd) / ethData.ethUsd * 100
        const verified  = deviation < 0.5
        log(`[TrustBox] ETH/USD deviation: ${deviation.toFixed(4)}% → ${verified ? 'VERIFIED' : 'ANOMALY'}`)

        const result: PriceFeedResult = {
          avaxUsd:    avaxData.avaxUsd,
          ethUsdAvax: avaxData.ethUsd,
          ethUsdEth:  ethData.ethUsd,
          deviation,
          verified,
          timestamp:  new Date().toISOString(),
          blockAvax:  avaxData.blockNumber,
          blockEth:   ethData.blockNumber,
        }

        // 4. Write verified composite price on-chain via CRE report
        //    Non-verified (anomaly) prices are flagged but still written
        //    so the audit trail on Tenderly shows what was seen
        const writeRes = httpClient.sendRequest(nodeRuntime, {
          url:          `${apiUrl}/api/price/write-verified`,
          method:       'POST',
          multiHeaders: jsonHeaders,
          body:         Buffer.from(JSON.stringify(result)).toString('base64'),
        })
        const writeData = json(writeRes.result()) as { txHash: string; onChainPrice: number }
        log(`[TrustBox] Written on-chain → tx: ${writeData.txHash} price: $${writeData.onChainPrice}`)

        return result
      },
      consensusIdenticalAggregation<PriceFeedResult>(),
    )().result()
  }
)

// ─── Entry point ──────────────────────────────────────────────
export async function main() {
  const runner = await Runner.newRunner<TrustBoxConfig>()
  await runner.run(() => [
    executeIntentHandler,
    refreshCreditScoresHandler,
    refreshAgentScoresHandler,
    verifyPriceFeedsHandler,     // Workflow 4 — Tenderly VTN cross-chain price verification
  ])
}