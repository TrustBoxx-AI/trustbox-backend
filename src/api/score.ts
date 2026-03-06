/* api/score.ts — TrustBox
   POST /api/score — ZK credit score + Hedera HCS + HTS NFT

   FIXES:
     H-03 — requireWalletSig now BEFORE validate() (sig over raw body).
     M-08 — saveScore() called so history endpoint is populated.
   ─────────────────────────────────────────────────────── */

import { Router, Request, Response } from "express"
import { ethers }            from "ethers"
import { requireWalletSig }  from "../middleware/auth"
import { walletRateLimit }   from "../middleware/rateLimit"
import { validate, ScoreSchema } from "../middleware/validate"
import { verifyProof, scoreBandLabel, scoreBandRange, zkCircuitReady } from "../services/zk"
import { pinZKReceipt }      from "../services/ipfs"
import { submitCreditScoreTrail, mintCreditNFT, submitHCSMessage } from "../services/hedera"
import { saveScore }         from "../services/supabase"

export const scoreRouter = Router()

function buildDemoScore(walletAddress: string, modelVersion: string) {
  const scoreBand   = 3
  const scoreHash   = ethers.id(`demo_${walletAddress}_${Date.now()}`)
  const receiptCID  = `QmDemo${scoreHash.slice(2, 30)}`
  const timestamp   = new Date().toISOString()
  const seqNum      = String(Math.floor(Math.random() * 999999))

  return {
    success:            true,
    action:             "score",
    chain:              "hedera",
    proofValid:         false,
    demo:               true,
    scoreHash,
    scoreBand,
    scoreBandLabel:     scoreBandLabel(scoreBand),
    scoreBandRange:     scoreBandRange(scoreBand),
    receiptCID,
    topicId:            process.env.HCS_CREDIT_TOPIC_ID ?? "0.0.demo",
    sequenceNum:        seqNum,
    consensusTimestamp: timestamp,
    htsTokenId:         null,
    htsSerial:          null,
    explorerUrl:        `https://hashscan.io/testnet/topic/${process.env.HCS_CREDIT_TOPIC_ID ?? "0.0.demo"}`,
    nftExplorer:        null,
    modelVersion,
    proofType:          "Demo (ZK-SNARK circuit not compiled — run zk/compile.sh to enable)",
    timestamp,
  }
}

scoreRouter.post("/",
  walletRateLimit,
  requireWalletSig,          // FIX H-03: sig verification BEFORE Zod coercion
  validate(ScoreSchema),
  async (req: Request, res: Response) => {
    try {
      const {
        walletAddress,
        hederaAccountId,
        proof,
        publicSignals,
        modelVersion,
      } = req.body

      const isDemo = !proof || !publicSignals?.length || !zkCircuitReady()

      if (isDemo) {
        console.log(`[score] Demo mode — wallet: ${walletAddress}`)

        try {
          await submitHCSMessage(
            process.env.HCS_CREDIT_TOPIC_ID ?? "0.0.demo",
            {
              type:          "credit_score_demo",
              walletAddress,
              scoreBand:     3,
              modelVersion,
              timestamp:     new Date().toISOString(),
            }
          )
        } catch (hcsErr: any) {
          console.warn(`[score] HCS demo warning: ${hcsErr.message}`)
        }

        const demoResult = buildDemoScore(walletAddress, modelVersion)

        // FIX M-08: persist demo score to Supabase so history page shows data
        await saveScore({
          walletAddress,
          score:        0,            // actual score is private in ZK model
          scoreBand:    demoResult.scoreBand,
          scoreHash:    demoResult.scoreHash,
          zkProofCID:   demoResult.receiptCID,
          hcsMessageId: demoResult.sequenceNum,
          modelVersion,
          explorerUrl:  demoResult.explorerUrl,
        }).catch(e => console.warn("[score] saveScore (demo) warning:", e.message))

        return res.json(demoResult)
      }

      // ── Full ZK path ──────────────────────────────────────────

      const { valid, scoreHash, scoreBand } = await verifyProof(proof, publicSignals)
      if (!valid) {
        return res.status(400).json({ error: "ZK proof verification failed" })
      }

      console.log(`[score] Proof verified — band: ${scoreBand} (${scoreBandLabel(scoreBand)})`)

      const timestamp = new Date().toISOString()

      const { cid: receiptCID } = await pinZKReceipt({
        proof,
        publicSignals,
        scoreHash,
        scoreBand,
        modelVersion,
        timestamp,
      })

      console.log(`[score] ZK receipt pinned — CID: ${receiptCID}`)

      const { sequenceNumber, consensusTimestamp } = await submitCreditScoreTrail({
        walletAddress,
        scoreHash,
        zkProofCID: receiptCID,
        scoreBand,
        modelVersion,
      })

      console.log(`[score] HCS message submitted — seq: ${sequenceNumber}`)

      let nft = null
      if (hederaAccountId) {
        try {
          nft = await mintCreditNFT(hederaAccountId, {
            walletAddress,
            score:        0,
            scoreBand,
            zkProofCID:   receiptCID,
            hcsSeqNum:    sequenceNumber,
            modelVersion,
            timestamp,
          })
          console.log(`[score] HTS NFT minted — serial: ${nft.serial}`)
        } catch (err: any) {
          console.warn(`[score] HTS mint warning: ${err.message}`)
        }
      }

      const explorerUrl = `https://hashscan.io/testnet/topic/${process.env.HCS_CREDIT_TOPIC_ID}`

      // FIX M-08: persist to Supabase
      await saveScore({
        walletAddress,
        score:        0,
        scoreBand,
        scoreHash,
        zkProofCID:   receiptCID,
        hcsMessageId: sequenceNumber,
        tokenId:      nft?.serial?.toString(),
        modelVersion,
        explorerUrl,
      }).catch(e => console.warn("[score] saveScore warning:", e.message))

      res.json({
        success:            true,
        action:             "score",
        chain:              "hedera",
        proofValid:         valid,
        demo:               false,
        scoreHash,
        scoreBand,
        scoreBandLabel:     scoreBandLabel(scoreBand),
        scoreBandRange:     scoreBandRange(scoreBand),
        receiptCID,
        topicId:            process.env.HCS_CREDIT_TOPIC_ID,
        sequenceNum:        sequenceNumber,
        consensusTimestamp,
        htsTokenId:         nft?.tokenId  ?? null,
        htsSerial:          nft?.serial   ?? null,
        explorerUrl,
        nftExplorer:        nft?.explorerUrl ?? null,
        modelVersion,
        proofType:          "ZK-SNARK (Groth16)",
        timestamp,
      })
    } catch (err: any) {
      console.error("[score] Error:", err.message)
      res.status(500).json({ error: err.message })
    }
  }
)
