/* api/price.ts — TrustBox
   GET  /api/price/avax-vtn       — reads AVAX/USD + ETH/USD from Avalanche VTN fork
   GET  /api/price/eth-vtn        — reads ETH/USD + BTC/USD from Ethereum VTN fork
   GET  /api/price/live           — reads from Fuji (existing testnet)
   POST /api/price/write-verified — writes cross-chain verified composite price on-chain
   ─────────────────────────────────────────────────────────────────────────────────
   CRE Workflow 4 (verifyPriceFeedsHandler) calls these endpoints on a 15-min cron.
   The two VTN forks are independent Tenderly Virtual TestNets:
     - TENDERLY_AVAX_RPC: fork of Avalanche C-Chain mainnet (43114)
     - TENDERLY_ETH_RPC:  fork of Ethereum mainnet (1)
   Both forks have the REAL Chainlink price feed contracts deployed at mainnet
   addresses — no mocks, no stubs, actual latestRoundData() with live values.
   ──────────────────────────────────────────────────────────────────────────── */

import { Router, Request, Response } from "express"
import { ethers }                     from "ethers"
import { env }                        from "../config/env"
import { apiLimiter }                 from "../middleware/rateLimit"

export const priceRouter = Router()

// ── AggregatorV3Interface ABI ─────────────────────────────────
const AGGREGATOR_ABI = [
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() external view returns (uint8)",
  "function description() external view returns (string)",
]

// ── Price feed addresses ──────────────────────────────────────
// Avalanche mainnet (live on VTN-AVAX fork)
const FEEDS_AVAX = {
  AVAX_USD: "0x0A77230d17318075983913bC2145DB16C7366156",
  ETH_USD:  "0x976B3D034E162d8bD72D6b9C989d545b839003b0",
  BTC_USD:  "0x2779D32d5166BAaa2B2b658333bA7e6Ec0C65743",
}

// Ethereum mainnet (live on VTN-ETH fork)
const FEEDS_ETH = {
  ETH_USD: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  BTC_USD: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
  LINK_USD:"0x2c1d072e956AFFC0D435Cb7AC308d97e0cb1bAA0",
}

// Avalanche Fuji testnet (existing — less reliable, fake values)
const FEEDS_FUJI = {
  AVAX_USD: "0x5498BB86BC934c8D34FDA08E81D444153d0D06aD",
  ETH_USD:  "0x86d67c3D38D2bCeE722E601025C25a575021c6EA",
  BTC_USD:  "0x31CF013A08c6Ac228C94551d535d5BAfE19c602a",
}

// ── Helper: read one feed ─────────────────────────────────────
async function readFeed(
  provider: ethers.JsonRpcProvider,
  address:  string,
  name:     string
): Promise<{ name: string; address: string; price: number; decimals: number; updatedAt: number }> {
  const feed = new ethers.Contract(address, AGGREGATOR_ABI, provider)
  const [, answer,, updatedAt] = await feed.latestRoundData()
  const decimals               = await feed.decimals()
  const price                  = Number(answer) / Math.pow(10, Number(decimals))
  return { name, address, price, decimals: Number(decimals), updatedAt: Number(updatedAt) }
}

// ── GET /api/price/avax-vtn ───────────────────────────────────
// Reads live Chainlink feeds from Avalanche mainnet fork VTN.
// Used by CRE Workflow 4 as Source A of cross-chain verification.
priceRouter.get("/avax-vtn", apiLimiter, async (_req: Request, res: Response) => {
  const rpcUrl = env.TENDERLY_AVAX_RPC
  if (!rpcUrl) {
    return res.status(503).json({
      error:    "TENDERLY_AVAX_RPC not configured",
      fallback: "Use /api/price/live for Fuji testnet feeds",
    })
  }

  try {
    const provider    = new ethers.JsonRpcProvider(rpcUrl)
    const blockNumber = await provider.getBlockNumber()
    const network     = await provider.getNetwork()

    const feedResults = await Promise.allSettled([
      readFeed(provider, FEEDS_AVAX.AVAX_USD, "AVAX/USD"),
      readFeed(provider, FEEDS_AVAX.ETH_USD,  "ETH/USD"),
      readFeed(provider, FEEDS_AVAX.BTC_USD,  "BTC/USD"),
    ])

    const feeds: Record<string, unknown> = {}
    for (const result of feedResults) {
      if (result.status === "fulfilled") {
        feeds[result.value.name] = result.value
      }
    }

    const avaxFeed = feedResults[0].status === "fulfilled" ? feedResults[0].value : null
    const ethFeed  = feedResults[1].status === "fulfilled" ? feedResults[1].value : null

    res.json({
      source:      "tenderly-vtn-avax",
      network:     "Avalanche C-Chain mainnet fork",
      chainId:     Number(network.chainId),
      blockNumber,
      fetchedAt:   new Date().toISOString(),
      avaxUsd:     avaxFeed?.price    ?? 0,
      ethUsd:      ethFeed?.price     ?? 0,
      feeds,
      tenderlyVtn: true,
      explorerUrl: env.TENDERLY_EXPLORER_URL ?? null,
    })
  } catch (err: any) {
    console.error("[price/avax-vtn] Error:", err.message)
    res.status(500).json({ error: err.message, rpc: "tenderly-avax" })
  }
})

// ── GET /api/price/eth-vtn ────────────────────────────────────
// Reads live Chainlink feeds from Ethereum mainnet fork VTN.
// Used by CRE Workflow 4 as Source B of cross-chain verification.
priceRouter.get("/eth-vtn", apiLimiter, async (_req: Request, res: Response) => {
  const rpcUrl = env.TENDERLY_ETH_RPC
  if (!rpcUrl) {
    return res.status(503).json({
      error:    "TENDERLY_ETH_RPC not configured",
      note:     "Create a second Tenderly VTN forked from Ethereum mainnet (chainId 1)",
      docsUrl:  "https://dashboard.tenderly.co/virtual-testnets",
    })
  }

  try {
    const provider    = new ethers.JsonRpcProvider(rpcUrl)
    const blockNumber = await provider.getBlockNumber()
    const network     = await provider.getNetwork()

    const feedResults = await Promise.allSettled([
      readFeed(provider, FEEDS_ETH.ETH_USD,  "ETH/USD"),
      readFeed(provider, FEEDS_ETH.BTC_USD,  "BTC/USD"),
      readFeed(provider, FEEDS_ETH.LINK_USD, "LINK/USD"),
    ])

    const feeds: Record<string, unknown> = {}
    for (const result of feedResults) {
      if (result.status === "fulfilled") {
        feeds[result.value.name] = result.value
      }
    }

    const ethFeed = feedResults[0].status === "fulfilled" ? feedResults[0].value : null

    res.json({
      source:      "tenderly-vtn-eth",
      network:     "Ethereum mainnet fork",
      chainId:     Number(network.chainId),
      blockNumber,
      fetchedAt:   new Date().toISOString(),
      ethUsd:      ethFeed?.price ?? 0,
      feeds,
      tenderlyVtn: true,
      explorerUrl: env.TENDERLY_EXPLORER_URL ?? null,
    })
  } catch (err: any) {
    console.error("[price/eth-vtn] Error:", err.message)
    res.status(500).json({ error: err.message, rpc: "tenderly-eth" })
  }
})

// ── GET /api/price/live ───────────────────────────────────────
// Reads from Fuji testnet (existing — values less reliable than VTN)
priceRouter.get("/live", apiLimiter, async (_req: Request, res: Response) => {
  try {
    const provider    = new ethers.JsonRpcProvider(env.AVALANCHE_FUJI_RPC)
    const blockNumber = await provider.getBlockNumber()

    const feedResults = await Promise.allSettled([
      readFeed(provider, FEEDS_FUJI.AVAX_USD, "AVAX/USD"),
      readFeed(provider, FEEDS_FUJI.ETH_USD,  "ETH/USD"),
      readFeed(provider, FEEDS_FUJI.BTC_USD,  "BTC/USD"),
    ])

    const feeds: Record<string, unknown> = {}
    for (const result of feedResults) {
      if (result.status === "fulfilled") feeds[result.value.name] = result.value
    }

    const avaxFeed = feedResults[0].status === "fulfilled" ? feedResults[0].value : null
    const ethFeed  = feedResults[1].status === "fulfilled" ? feedResults[1].value : null

    res.json({
      source:    "avalanche-fuji",
      network:   "Avalanche Fuji testnet",
      chainId:   43113,
      blockNumber,
      fetchedAt: new Date().toISOString(),
      avaxUsd:   avaxFeed?.price ?? 0,
      ethUsd:    ethFeed?.price  ?? 0,
      feeds,
      tenderlyVtn: false,
      note: "Use /api/price/avax-vtn for mainnet-accurate values from Tenderly VTN",
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/price/write-verified ───────────────────────────
// Called by CRE Workflow 4 after cross-chain verification.
// Writes the composite verified price to the AuditRegistry as
// a special "price feed" report type — anchored on-chain with
// both source feed readings and the deviation proof.
priceRouter.post("/write-verified", apiLimiter, async (req: Request, res: Response) => {
  try {
    const {
      avaxUsd, ethUsdAvax, ethUsdEth,
      deviation, verified, timestamp,
      blockAvax, blockEth,
    } = req.body

    if (typeof ethUsdAvax !== "number") {
      return res.status(400).json({ error: "ethUsdAvax required" })
    }

    // Composite price = average of the two ETH/USD sources
    const compositePriceUsd = verified
      ? ((ethUsdAvax + (ethUsdEth ?? ethUsdAvax)) / 2)
      : ethUsdAvax   // fallback to single source if cross-chain not available

    // Build a deterministic feed report hash
    const reportPayload = {
      type:           "cross-chain-verified-price",
      compositePriceUsd,
      sources: {
        avaxVtn: { ethUsd: ethUsdAvax, block: blockAvax, feed: FEEDS_AVAX.ETH_USD },
        ethVtn:  { ethUsd: ethUsdEth,  block: blockEth,  feed: FEEDS_ETH.ETH_USD  },
      },
      deviation:   deviation ?? 0,
      verified:    verified  ?? false,
      timestamp:   timestamp ?? new Date().toISOString(),
      avaxUsd:     avaxUsd   ?? 0,
    }

    const reportHash   = ethers.id(JSON.stringify(reportPayload))
    const reportHex    = ethers.hexlify(ethers.toUtf8Bytes(JSON.stringify(reportPayload)))

    // Write to AuditRegistry on the Tenderly VTN
    // (Uses TENDERLY_AVAX_RPC if set, falls back to Fuji)
    const rpcUrl    = env.TENDERLY_AVAX_RPC ?? env.AVALANCHE_FUJI_RPC
    const provider  = new ethers.JsonRpcProvider(rpcUrl)
    const signer    = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider) as any

    const AUDIT_REGISTRY_ABI = [
      "function submitAudit(address contractAddr, bytes32 reportHash, bytes32 merkleRoot, bytes calldata auditorSig) external",
    ]
    const auditAddr = env.AUDIT_REGISTRY_TENDERLY_ADDR ?? env.AUDIT_REGISTRY_ADDR
    if (!auditAddr) {
      // Soft fail — return the price without on-chain write
      return res.json({
        success:         true,
        onChainPrice:    compositePriceUsd,
        reportHash,
        txHash:          null,
        note:            "AUDIT_REGISTRY_ADDR not set — price computed but not anchored on-chain",
        reportPayload,
      })
    }

    const auditRegistry = new ethers.Contract(auditAddr, AUDIT_REGISTRY_ABI, signer)
    const merkleRoot    = ethers.id(reportHex)
    const sigBytes      = ethers.getBytes(reportHash)
    const auditorSig    = await signer.signMessage(sigBytes)

    const feeData   = await provider.getFeeData()
    const gasConfig = {
      maxFeePerGas:         feeData.maxFeePerGas         ?? ethers.parseUnits("30", "gwei"),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? ethers.parseUnits("2",  "gwei"),
    }

    // Use a deterministic address derived from the report hash as the "contract address"
    // field — this makes each price feed report uniquely identifiable on-chain
    const reportId = "0x" + reportHash.slice(2, 42)

    const tx      = await auditRegistry.submitAudit(reportId, reportHash, merkleRoot, auditorSig, gasConfig)
    const receipt = await tx.wait(1)

    console.log(`[price/write-verified] Price anchored on-chain: $${compositePriceUsd.toFixed(2)} tx: ${receipt.hash}`)

    res.json({
      success:         true,
      onChainPrice:    compositePriceUsd,
      reportHash,
      txHash:          receipt.hash,
      explorerUrl:     env.TENDERLY_EXPLORER_URL
        ? `${env.TENDERLY_EXPLORER_URL}/tx/${receipt.hash}`
        : `https://testnet.snowtrace.io/tx/${receipt.hash}`,
      reportPayload,
    })
  } catch (err: any) {
    console.error("[price/write-verified] Error:", err.message)
    res.status(500).json({ error: err.message })
  }
})