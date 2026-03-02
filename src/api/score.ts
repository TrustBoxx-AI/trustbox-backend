/* api/score.ts — TrustBox
   POST /api/score — ZK credit score + Hedera HCS + HTS NFT
   ──────────────────────────────────────────────────────────
   Client proves score in browser (Web Worker + snarkjs).
   Server only verifies proof + anchors to Hedera.
   ──────────────────────────────────────────────────────────
   1. Receive ZK proof + public signals from client
   2. Verify Groth16 proof server-side
   3. Pin ZK receipt to IPFS
   4. Submit HCS message (credit score trail)
   5. Mint HTS credential NFT
   6. Return all proof references
   ─────────────────────────────────────────────────────── */

import { Router, Request, Response } from "express";
import { requireWalletSig }   from "../middleware/auth";
import { walletRateLimit }    from "../middleware/rateLimit";
import { validate, ScoreSchema } from "../middleware/validate";
import { verifyProof, scoreBandLabel, scoreBandRange, zkCircuitReady } from "../services/zk";
import { pinZKReceipt }       from "../services/ipfs";
import { submitCreditScoreTrail, mintCreditNFT } from "../services/hedera";

export const scoreRouter = Router();

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
      } = req.body;

      // 0. Check circuit files exist (Session 11 prerequisite)
      if (!zkCircuitReady()) {
        return res.status(503).json({
          error: "ZK circuit not compiled yet — build CreditScore.circom (Session 11)",
        });
      }

      // 1. Verify Groth16 proof
      const { valid, scoreHash, scoreBand } = await verifyProof(proof, publicSignals);
      if (!valid) {
        return res.status(400).json({ error: "ZK proof verification failed" });
      }

      console.log(`[score] Proof verified — band: ${scoreBand} (${scoreBandLabel(scoreBand)})`);

      const timestamp = new Date().toISOString();

      // 2. Pin ZK receipt to IPFS
      const { cid: receiptCID } = await pinZKReceipt({
        proof,
        publicSignals,
        scoreHash,
        scoreBand,
        modelVersion,
        timestamp,
      });

      console.log(`[score] ZK receipt pinned — CID: ${receiptCID}`);

      // 3. Submit HCS credit trail
      const { sequenceNumber, consensusTimestamp } = await submitCreditScoreTrail({
        walletAddress,
        scoreHash,
        zkProofCID: receiptCID,
        scoreBand,
        modelVersion,
      });

      console.log(`[score] HCS message submitted — seq: ${sequenceNumber}`);

      // 4. Mint HTS credential NFT
      let nft = null;
      try {
        nft = await mintCreditNFT(hederaAccountId, {
          walletAddress,
          score:        0, // score itself is private — only band is public
          scoreBand,
          zkProofCID:   receiptCID,
          hcsSeqNum:    sequenceNumber,
          modelVersion,
          timestamp,
        });
        console.log(`[score] HTS NFT minted — serial: ${nft.serial}`);
      } catch (err: any) {
        // NFT mint failure is non-fatal — HCS proof is still valid
        console.warn(`[score] HTS mint warning: ${err.message}`);
      }

      res.json({
        success:      true,
        action:       "score",
        chain:        "hedera",
        proofValid:   valid,
        scoreHash,
        scoreBand,
        scoreBandLabel:scoreBandLabel(scoreBand),
        scoreBandRange:scoreBandRange(scoreBand),
        receiptCID,
        topicId:      process.env.HCS_CREDIT_TOPIC_ID,
        sequenceNum:  sequenceNumber,
        consensusTimestamp,
        htsTokenId:   nft?.tokenId ?? null,
        htsSerial:    nft?.serial  ?? null,
        explorerUrl:  `https://hashscan.io/testnet/topic/${process.env.HCS_CREDIT_TOPIC_ID}`,
        nftExplorer:  nft?.explorerUrl ?? null,
        modelVersion,
        proofType:    "ZK-SNARK (Groth16)",
        timestamp,
      });
    } catch (err: any) {
      console.error("[score] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);
