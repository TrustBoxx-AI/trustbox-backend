
import * as hre  from "hardhat"
import * as fs   from "fs"
import * as path from "path"
import * as dotenv from "dotenv"
dotenv.config()

// ── Tenderly Admin RPC: used to set balances via tenderly_setBalance ──────────
// This is the privileged RPC that accepts state-manipulation calls.
const TENDERLY_ADMIN_RPC  = process.env.TENDERLY_ADMIN_RPC  ?? process.env.TENDERLY_AVAX_RPC ?? ""
const TENDERLY_EXPLORER   = process.env.TENDERLY_EXPLORER_URL ?? "https://dashboard.tenderly.co/explorer"

// ── Chainlink mainnet addresses (live on Avalanche C-Chain mainnet) ───────────
// These are already deployed at these addresses on mainnet — forking means
// the VTN has the real price feed contracts with live data.
const CHAINLINK_MAINNET = {
  // Avalanche mainnet Chainlink price feeds
  AVAX_USD:   "0x0A77230d17318075983913bC2145DB16C7366156",
  ETH_USD:    "0x976B3D034E162d8bD72D6b9C989d545b839003b0",
  BTC_USD:    "0x2779D32d5166BAaa2B2b658333bA7e6Ec0C65743",
}

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  const network    = hre.network.name
  const chainId    = await deployer.provider!.getNetwork().then(n => Number(n.chainId))

  console.log("═══════════════════════════════════════════════════════")
  console.log("  TrustBox — Tenderly Virtual TestNet Deployment")
  console.log(`  Network:   ${network}  (chainId: ${chainId})`)
  console.log(`  Deployer:  ${deployer.address}`)
  console.log(`  Explorer:  ${TENDERLY_EXPLORER}`)
  console.log("═══════════════════════════════════════════════════════\n")

  // ── Step 0: Fund deployer via Tenderly state override ──────────────────────
  // VTN unlimited faucet — set deployer balance to 1000 AVAX
  if (TENDERLY_ADMIN_RPC) {
    console.log("💰 Funding deployer via Tenderly faucet...")
    await fundAccount(deployer.address, "1000")
    const balance = await deployer.provider!.getBalance(deployer.address)
    console.log(`   ✅ Balance: ${hre.ethers.formatEther(balance)} AVAX\n`)
  }

  const deployed: Record<string, string> = {}
  const explorerLinks: Record<string, string> = {}

  // ── 1. TrustRegistry (ERC-8004) ────────────────────────────────────────────
  console.log("📦 Deploying TrustRegistry...")
  const TrustRegistryFactory = await hre.ethers.getContractFactory("TrustRegistry")
  const trustRegistry        = await TrustRegistryFactory.deploy()
  await trustRegistry.waitForDeployment()
  deployed.trustRegistry     = await trustRegistry.getAddress()
  explorerLinks.trustRegistry = `${TENDERLY_EXPLORER}/contract/${deployed.trustRegistry}`
  console.log(`   ✅ TrustRegistry:   ${deployed.trustRegistry}`)
  console.log(`   🔍 Explorer:        ${explorerLinks.trustRegistry}`)

  // ── 2. AuditRegistry ───────────────────────────────────────────────────────
  console.log("\n📦 Deploying AuditRegistry...")
  const AuditRegistryFactory = await hre.ethers.getContractFactory("AuditRegistry")
  const auditRegistry        = await AuditRegistryFactory.deploy()
  await auditRegistry.waitForDeployment()
  deployed.auditRegistry     = await auditRegistry.getAddress()
  explorerLinks.auditRegistry = `${TENDERLY_EXPLORER}/contract/${deployed.auditRegistry}`
  console.log(`   ✅ AuditRegistry:   ${deployed.auditRegistry}`)
  console.log(`   🔍 Explorer:        ${explorerLinks.auditRegistry}`)

  // Post-deploy: register deployer as authorised auditor
  const auditorTx = await (auditRegistry as any).addAuditor(deployer.address)
  await auditorTx.wait()
  console.log(`   ✅ Deployer registered as authorised auditor`)

  // ── 3. IntentVault ─────────────────────────────────────────────────────────
  console.log("\n📦 Deploying IntentVault...")
  const IntentVaultFactory = await hre.ethers.getContractFactory("IntentVault")
  const intentVault        = await IntentVaultFactory.deploy()
  await intentVault.waitForDeployment()
  deployed.intentVault     = await intentVault.getAddress()
  explorerLinks.intentVault = `${TENDERLY_EXPLORER}/contract/${deployed.intentVault}`
  console.log(`   ✅ IntentVault:     ${deployed.intentVault}`)
  console.log(`   🔍 Explorer:        ${explorerLinks.intentVault}`)

  // ── 4. AgentMarketplace ────────────────────────────────────────────────────
  console.log("\n📦 Deploying AgentMarketplace...")
  const AgentMarketplaceFactory = await hre.ethers.getContractFactory("AgentMarketplace")
  const agentMarketplace        = await AgentMarketplaceFactory.deploy()
  await agentMarketplace.waitForDeployment()
  deployed.agentMarketplace     = await agentMarketplace.getAddress()
  explorerLinks.agentMarketplace = `${TENDERLY_EXPLORER}/contract/${deployed.agentMarketplace}`
  console.log(`   ✅ AgentMarketplace: ${deployed.agentMarketplace}`)
  console.log(`   🔍 Explorer:         ${explorerLinks.agentMarketplace}`)

  // ── 5. FunctionsConsumer (Chainlink Functions) ─────────────────────────────
  // On Tenderly VTN (forked from Avalanche mainnet) the Chainlink Functions
  // Router is live at the same mainnet address.
  const AVAX_MAINNET_ROUTER = "0x4b9E8ef5D56A7E04f85a0f0e9C0b8f4E5e6C7D8" // placeholder
  const AVAX_MAINNET_DON_ID = hre.ethers.encodeBytes32String("fun-avalanche-mainnet-1")

  if (process.env.CHAINLINK_SUBSCRIPTION_ID) {
    console.log("\n📦 Deploying FunctionsConsumer...")
    try {
      const FunctionsFactory  = await hre.ethers.getContractFactory("FunctionsConsumer")
      const functionsConsumer = await FunctionsFactory.deploy(
        process.env.TENDERLY_FUNCTIONS_ROUTER ?? AVAX_MAINNET_ROUTER,
        process.env.TENDERLY_DON_ID ? hre.ethers.encodeBytes32String(process.env.TENDERLY_DON_ID) : AVAX_MAINNET_DON_ID,
        Number(process.env.CHAINLINK_SUBSCRIPTION_ID)
      )
      await functionsConsumer.waitForDeployment()
      deployed.functionsConsumer     = await functionsConsumer.getAddress()
      explorerLinks.functionsConsumer = `${TENDERLY_EXPLORER}/contract/${deployed.functionsConsumer}`
      console.log(`   ✅ FunctionsConsumer: ${deployed.functionsConsumer}`)
      console.log(`   🔍 Explorer:          ${explorerLinks.functionsConsumer}`)
    } catch (err: any) {
      console.warn(`   ⚠️  FunctionsConsumer skipped: ${err.message}`)
    }
  }

  // ── 6. Verify Chainlink price feeds are live (mainnet fork) ───────────────
  console.log("\n🔮 Verifying Chainlink price feeds (live mainnet state)...")
  const aggABI = ["function latestRoundData() external view returns (uint80,int256,uint256,uint256,uint80)"]

  for (const [name, addr] of Object.entries(CHAINLINK_MAINNET)) {
    try {
      const feed   = new hre.ethers.Contract(addr, aggABI, deployer)
      const [, answer,,,] = await feed.latestRoundData()
      const price  = Number(answer) / 1e8
      console.log(`   ✅ ${name}: $${price.toFixed(2)} (live from mainnet fork)`)
    } catch {
      console.log(`   ⚠️  ${name}: feed not available (may need Tenderly VTN to be synced)`)
    }
  }

  // ── 7. Save deployment manifest ────────────────────────────────────────────
  const outputDir  = path.resolve(__dirname, "../../deployments")
  fs.mkdirSync(outputDir, { recursive: true })

  const manifest = {
    network:       "tenderly-avax",
    chainId,
    deployedAt:    new Date().toISOString(),
    deployer:      deployer.address,
    explorerBase:  TENDERLY_EXPLORER,
    contracts:     deployed,
    explorerLinks,
    chainlinkMainnetFeeds: CHAINLINK_MAINNET,
    note: "Forked from Avalanche C-Chain mainnet. Real Chainlink price feed state available.",
  }

  const outputPath = path.join(outputDir, "tenderly-avax.json")
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2))
  console.log(`\n📄 Deployment manifest: ${outputPath}`)

  // ── 8. Update .env ─────────────────────────────────────────────────────────
  const envPath    = path.resolve(process.cwd(), ".env")
  let   envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : ""

  const envUpdates: Record<string, string> = {
    TRUST_REGISTRY_TENDERLY_ADDR:    deployed.trustRegistry     ?? "",
    AUDIT_REGISTRY_TENDERLY_ADDR:    deployed.auditRegistry     ?? "",
    INTENT_VAULT_TENDERLY_ADDR:      deployed.intentVault       ?? "",
    AGENT_MARKETPLACE_TENDERLY_ADDR: deployed.agentMarketplace  ?? "",
    FUNCTIONS_CONSUMER_TENDERLY_ADDR:deployed.functionsConsumer ?? "",
  }

  for (const [key, value] of Object.entries(envUpdates)) {
    if (!value) continue
    const regex = new RegExp(`^${key}=.*$`, "m")
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`)
    } else {
      envContent += `\n${key}=${value}`
    }
  }
  fs.writeFileSync(envPath, envContent)
  console.log("✅ .env updated with Tenderly contract addresses")

  // ── Final summary ───────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════")
  console.log("  ✅ Tenderly VTN Deployment Complete!")
  console.log("\n  Contract Explorer Links (for hackathon submission):")
  for (const [name, link] of Object.entries(explorerLinks)) {
    console.log(`  ${name.padEnd(22)} → ${link}`)
  }
  console.log("\n  Next:")
  console.log("  1. npx hardhat run scripts/deploy/cre-simulate.ts --network tenderly-avax")
  console.log("     → Simulates all 4 CRE workflows, generates tx trace links")
  console.log("  2. Copy the Transaction Explorer URLs into your submission")
  console.log("═══════════════════════════════════════════════════════\n")
}

// ── Fund account via Tenderly state override ────────────────────────────────
async function fundAccount(address: string, avaxAmount: string) {
  if (!TENDERLY_ADMIN_RPC) return
  const weiHex = "0x" + (BigInt(hre.ethers.parseEther(avaxAmount).toString())).toString(16)
  await fetch(TENDERLY_ADMIN_RPC, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method:  "tenderly_setBalance",
      params:  [[address], weiHex],
    }),
  })
}

main().catch(err => {
  console.error("❌ Deployment failed:", err.message)
  process.exit(1)
})
