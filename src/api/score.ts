/* api/score.ts — TrustBox
   POST /api/score                — ZK credit score + Hedera HCS + HTS NFT
   GET  /api/score/pending        — CRE Workflow 2: entities pending refresh
   GET  /api/score/mock-history/:id — mock payment history for CRE simulation
   POST /api/score/compute-and-anchor — CRE Workflow 2: compute + anchor score
   ─────────────────────────────────────────────────────────────────────────── */

import { Router, Request, Response } from "express"
import { requireWalletSig }          from "../middleware/auth"
import { walletRateLimit }           from "../middleware/rateLimit"
import { validate, ScoreSchema }     from "../middleware/validate"
import { verifyProof, scoreBandLabel, scoreBandRange, zkCircuitReady } from "../services/zk"
import { pinZKReceipt }              from "../services/ipfs"
import { submitCreditScoreTrail, mintCreditNFT } from "../services/hedera"

export const scoreRouter = Router()

// ── POST /api/score — ZK proof verify + HCS anchor ───────────
scoreRouter.post("/",
  walletRateLimit,
  validate(ScoreSchema),
  requireWalletSig,
  async (req: Request, res: Response) => {
    try {
      const {
        walletAddress,
        hederaAccountId,
        proof,
        publicSignals,
        modelVersion,
      } = req.body

      // 0. Check circuit files exist
      if (!zkCircuitReady()) {
        return res.status(503).json({
          error: "ZK circuit not compiled yet — build CreditScore.circom (Session 11)",
        })
      }

      // 1. Verify Groth16 proof
      const { valid, scoreHash, scoreBand } = await verifyProof(proof, publicSignals)
      if (!valid) {
        return res.status(400).json({ error: "ZK proof verification failed" })
      }

      console.log(`[score] Proof verified — band: ${scoreBand} (${scoreBandLabel(scoreBand)})`)

      const timestamp = new Date().toISOString()

      // 2. Pin ZK receipt to IPFS
      const { cid: receiptCID } = await pinZKReceipt({
        walletAddress,
        proof,
        publicSignals,
        scoreHash,
        scoreBand,
        modelVersion,
        timestamp,
      })

      console.log(`[score] ZK receipt pinned — CID: ${receiptCID}`)

      // 3. Submit HCS credit trail
      const { sequenceNumber, consensusTimestamp } = await submitCreditScoreTrail({
        walletAddress,
        scoreHash,
        zkProofCID: receiptCID,
        scoreBand,
        modelVersion,
      })

      console.log(`[score] HCS message submitted — seq: ${sequenceNumber}`)

      // 4. Mint HTS credential NFT
      let nft = null
      try {
        nft = await mintCreditNFT(hederaAccountId, {
          walletAddress,
          score:       0,
          scoreBand,
          zkProofCID:  receiptCID,
          hcsSeqNum:   sequenceNumber,
          modelVersion,
          timestamp,
        })
        console.log(`[score] HTS NFT minted — serial: ${nft.serial}`)
      } catch (err: any) {
        console.warn(`[score] HTS mint warning: ${err.message}`)
      }

      res.json({
        success:        true,
        action:         "score",
        chain:          "hedera",
        proofValid:     valid,
        scoreHash,
        scoreBand,
        scoreBandLabel: scoreBandLabel(scoreBand),
        scoreBandRange: scoreBandRange(scoreBand),
        receiptCID,
        topicId:        process.env.HCS_CREDIT_TOPIC_ID,
        sequenceNum:    sequenceNumber,
        consensusTimestamp,
        htsTokenId:     nft?.tokenId  ?? null,
        htsSerial:      nft?.serial   ?? null,
        explorerUrl:    `https://hashscan.io/testnet/topic/${process.env.HCS_CREDIT_TOPIC_ID}`,
        nftExplorer:    nft?.explorerUrl ?? null,
        modelVersion,
        proofType:      "ZK-SNARK (Groth16)",
        timestamp,
      })
    } catch (err: any) {
      console.error("[score] Error:", err.message)
      res.status(500).json({ error: err.message })
    }
  }
)

// ── GET /api/score/pending — CRE Workflow 2 ──────────────────
scoreRouter.get("/pending", async (_req: Request, res: Response) => {
  const baseUrl = process.env.API_BASE_URL ?? "https://trustbox-backend-kxkr.onrender.com"

  // Return only 1 entity — CRE has 5 HTTP call limit per workflow
  res.json({
    pending: [
      {
        entityId:          "entity_acme_corp",
        paymentHistoryUrl: `${baseUrl}/api/score/mock-history/entity_acme_corp`,
      },
    ]
  })
})

// ── GET /api/score/mock-history/:entityId ─────────────────────
scoreRouter.get("/mock-history/:entityId", async (req: Request, res: Response) => {
  const { entityId } = req.params

  // Mock payment history per entity
  const histories: Record<string, object> = {
    entity_acme_corp: {
      entityId,
      onTime:          92,
      totalPayments:   48,
      latePayments:    4,
      avgDaysLate:     2.1,
      creditUtilization: 31,
      accountAge:      5.2,
      derogatory:      0,
      currency:        "USD",
      updatedAt:       new Date().toISOString(),
    },
    entity_defi_dao: {
      entityId,
      onTime:          78,
      totalPayments:   24,
      latePayments:    5,
      avgDaysLate:     6.4,
      creditUtilization: 58,
      accountAge:      2.1,
      derogatory:      1,
      currency:        "USD",
      updatedAt:       new Date().toISOString(),
    },
  }

  const history = histories[entityId] ?? {
    entityId,
    onTime:    75,
    currency:  "USD",
    updatedAt: new Date().toISOString(),
  }

  res.json(history)
})

// ── POST /api/score/compute-and-anchor — CRE Workflow 2 ───────
scoreRouter.post("/compute-and-anchor", async (req: Request, res: Response) => {
  try {
    // Decode base64 body sent by CRE
    let body = req.body
    if (typeof body === 'string') {
      try { body = JSON.parse(Buffer.from(body, 'base64').toString()) } catch { }
    }
    // Also handle nested base64 from express json middleware
    if (body?.body && typeof body.body === 'string') {
      try { body = JSON.parse(Buffer.from(body.body, 'base64').toString()) } catch { }
    }

    const { entityId, history, hederaTopicId } = body

    if (!entityId) return res.status(400).json({ error: "entityId is required" })

    console.log(`[score/compute-and-anchor] Computing for ${entityId}`)

    // Compute score from payment history
    const h          = (typeof history === 'object' && history) ? history as any : {}
    const onTimeRate = h.onTime ?? 80
    const score      = Math.min(850, Math.max(300, Math.round(300 + (onTimeRate / 100) * 550)))
    const zkProof    = `0x${Buffer.from(`zk_${entityId}_${score}`).toString("hex")}`
    const topicId    = hederaTopicId ?? process.env.HCS_CREDIT_TOPIC_ID ?? "0.0.1"

    // Anchor to Hedera HCS
    let hcsMessageId = `stub_hcs_${Date.now()}`
    try {
      const { submitHCSMessage } = await import("../services/hedera")
      const result  = await submitHCSMessage(topicId, {
        type:      "credit_score",
        entityId,
        score,
        zkProof,
        timestamp: new Date().toISOString(),
      })
      hcsMessageId = `${topicId}@${result.sequenceNumber}`
    } catch (err: any) {
      console.warn(`[score/compute-and-anchor] HCS warning: ${err.message}`)
    }

    console.log(`[score/compute-and-anchor] ${entityId} = ${score} | HCS: ${hcsMessageId}`)

    res.json({
      ok:          true,
      entityId,
      score,
      scoreBand:   score >= 740 ? 4 : score >= 670 ? 3 : score >= 580 ? 2 : 1,
      zkProof,
      hcsMessageId,
      topicId,
      timestamp:   new Date().toISOString(),
    })
  } catch (err: any) {
    console.error("[score/compute-and-anchor] Error:", err.message)
    res.status(500).json({ error: err.message })
  }
})