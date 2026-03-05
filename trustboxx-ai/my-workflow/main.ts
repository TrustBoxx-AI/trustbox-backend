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

import type { TrustBoxConfig } from './types'

// ─── Capability clients ───────────────────────────────────────
const FUJI       = EVMClient.SUPPORTED_CHAIN_SELECTORS['avalanche-testnet-fuji']
const evmClient  = new EVMClient(FUJI)
const httpClient = new HTTPClient()

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

// ─── JSON headers ─────────────────────────────────────────────
const jsonHeaders = {
  'Content-Type': { values: ['application/json'] },
}

// ═══════════════════════════════════════════════════════════════
// Workflow 1: Intent Execution (EVM Log Trigger)
// ═══════════════════════════════════════════════════════════════
const executeIntentHandler = handler(
  evmClient.logTrigger({
    addresses: ['0xB9aE50f6989574504e6CA465283BaD9570944B67'],
    topics: [{ values: ['0xd9d4926cf0a81744b3d4e9b34db19b1ce3b3ff1eae30c36edadce6b20e01c0d1'] }],
  }),
  (runtime: Runtime<TrustBoxConfig>, _triggerLog: EVMLog): ExecResult => {

    const result = runtime.runInNodeMode(
      (nodeRuntime): ExecResult => {
        const apiUrl = runtime.config.apiUrl

        // Wake up Render backend
        httpClient.sendRequest(nodeRuntime, {
          url:    `${apiUrl}/health`,
          method: 'GET',
        })

        // 1. Fetch latest pending intent
        const intentRes = httpClient.sendRequest(nodeRuntime, {
          url:    `${apiUrl}/api/intent/pending`,
          method: 'GET',
        })

        const intent = json(intentRes.result()) as { intentId: string; spec: IntentSpec }
        console.log(`[TrustBox] Executing: ${intent.spec.action}`)

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
        console.log(`[TrustBox] Done: success=${execResult.success} CID=${execResult.resultCID}`)

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
    console.log('[TrustBox] Credit score cron fired')

    return runtime.runInNodeMode(
      (nodeRuntime): ScoreResult => {
        const apiUrl = runtime.config.apiUrl

        // Wake up Render backend before real calls
        httpClient.sendRequest(nodeRuntime, {
          url:    `${apiUrl}/health`,
          method: 'GET',
        })

        // 1. Fetch pending entities
        const pendingRes = httpClient.sendRequest(nodeRuntime, {
          url:    `${apiUrl}/api/score/pending`,
          method: 'GET',
        })

        const raw = json(pendingRes.result()) as any
        const pending: { entityId: string; paymentHistoryUrl: string }[] =
          Array.isArray(raw) ? raw : (raw?.pending ?? [])

        console.log(`[TrustBox] ${pending.length} entities pending score refresh`)

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

          console.log(`[TrustBox] ${entity.entityId} = ${score} | HCS: ${hcsMessageId}`)
          refreshed++
        }

        console.log(`[TrustBox] Credit scores done: ${refreshed}/${pending.length}`)
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
    console.log('[TrustBox] Agent trust score cron fired')

    return runtime.runInNodeMode(
      (nodeRuntime): AgentResult => {
        const apiUrl = runtime.config.apiUrl

        // Wake up Render backend before real calls
        httpClient.sendRequest(nodeRuntime, {
          url:    `${apiUrl}/health`,
          method: 'GET',
        })

        // 1. Fetch active agents
        const agentsRes = httpClient.sendRequest(nodeRuntime, {
          url:    `${apiUrl}/api/agents/active`,
          method: 'GET',
        })

        const raw = json(agentsRes.result()) as any
        const agents: { agentId: string; tokenId: number; teeEndpoint: string }[] =
          Array.isArray(raw) ? raw : (raw?.agents ?? [])

        console.log(`[TrustBox] Scanning ${agents.length} agents`)

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
            console.log(`[TrustBox] ${agent.agentId} → ${newScore}`)
            updated++
          }
        }

        console.log(`[TrustBox] Agent scores done: ${updated}/${agents.length}`)
        return { scanned: agents.length, updated }
      },
      consensusIdenticalAggregation<AgentResult>(),
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
  ])
}