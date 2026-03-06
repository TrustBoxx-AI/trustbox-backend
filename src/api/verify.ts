/* api/verify.ts — TrustBox
   POST /api/verify — ERC-8004 agent credential mint
   ─────────────────────────────────────────────────
   1. Validate request + wallet sig
   2. Compute modelHash = keccak256(model + capabilities)
   3. Pin agent metadata to IPFS (Pinata)
   4. Call TrustRegistry.mintCredential()
   5. Save record to Supabase
   6. Return tokenId + txHash + metadataCID

   FIXES:
     H-04 — requireWalletSig now comes BEFORE validate() so the
             signature is verified against the original raw body.
     M-09 — saveAgentNFT() now called so History page is populated.
   ─────────────────────────────────────────────────────── */

import { Router, Request, Response } from "express"
import { ethers }             from "ethers"
import { requireWalletSig }   from "../middleware/auth"
import { walletRateLimit }    from "../middleware/rateLimit"
import { validate, VerifySchema } from "../middleware/validate"
import { getTrustRegistry, waitForTx, getGasConfig } from "../services/ethers"
import { pinAgentMetadata }   from "../services/ipfs"
import { saveAgentNFT }       from "../services/supabase"

export const verifyRouter = Router()

verifyRouter.post("/",
  walletRateLimit,
  requireWalletSig,          // FIX H-04: sig verification BEFORE Zod coercion
  validate(VerifySchema),
  async (req: Request, res: Response) => {
    try {
      const {
        walletAddress,
        agentName,
        model,
        operator,
        capabilities,
        environment,
      } = req.body

      const capsArray = capabilities.split(",").map((c: string) => c.trim()).filter(Boolean)

      // 1. Compute hashes
      const agentId   = `agt_${ethers.id(agentName + operator + Date.now()).slice(2, 14)}`
      const modelHash = ethers.id(`${model}:${capsArray.join(",")}`)
      const capHash   = ethers.id(capsArray.join(","))

      // 2. Pin metadata to IPFS
      const trustScore = 85
      const mintedAt   = new Date().toISOString()

      const { cid, url } = await pinAgentMetadata({
        agentId,
        name:         agentName,
        model,
        operator,
        capabilities: capsArray,
        environment,
        modelHash,
        trustScore,
        mintedAt,
      })

      console.log(`[verify] Metadata pinned — CID: ${cid}`)

      // 3. Mint ERC-8004 NFT on TrustRegistry
      const registry  = getTrustRegistry()
      const gasConfig = await getGasConfig()

      const tx = await registry.mintCredential(
        agentId,
        modelHash,
        walletAddress,
        capHash,
        `ipfs://${cid}`,
        { ...gasConfig }
      )

      const receipt = await waitForTx(tx)
      console.log(`[verify] ERC-8004 minted — tx: ${receipt.hash}`)

      // 4. Extract tokenId from AgentRegistered event
      const iface = registry.interface
      let tokenId = "0"
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log)
          if (parsed?.name === "AgentRegistered") {
            tokenId = parsed.args.tokenId.toString()
          }
        } catch { /* skip non-matching logs */ }
      }

      const explorerUrl = `https://testnet.snowtrace.io/tx/${receipt.hash}`

      // 5. FIX M-09: persist to Supabase so history endpoint returns data
      await saveAgentNFT({
        walletAddress,
        tokenId,
        agentId,
        agentName,
        model,
        capabilities: capsArray,
        txHash:       receipt.hash,
        metadataCID:  cid,
        explorerUrl,
      }).catch(e => console.warn("[verify] saveAgentNFT warning:", e.message))

      res.json({
        success:      true,
        action:       "verify",
        tokenId,
        agentId,
        modelHash,
        metadataCID:  cid,
        metadataURL:  url,
        txHash:       receipt.hash,
        blockNumber:  receipt.blockNumber.toString(),
        gasUsed:      receipt.gasUsed.toString(),
        mintedAt,
        explorerUrl,
        tokenExplorer:`https://testnet.snowtrace.io/token/${await registry.getAddress()}?a=${tokenId}`,
        agentScore:   trustScore,
        issuer:       "TrustBox TrustRegistry v1.0",
      })
    } catch (err: any) {
      console.error("[verify] Error:", err.message)
      res.status(500).json({ error: err.message })
    }
  }
)
