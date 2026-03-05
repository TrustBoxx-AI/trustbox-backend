import * as hre from "hardhat"
import * as fs from "fs"
import * as path from "path"
import * as dotenv from "dotenv"
dotenv.config()

/**
 * Deploy all TrustBox contracts to Avalanche Fuji
 * Run: bun run deploy:fuji
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners()
  const network    = hre.network.name
  const balance    = await hre.ethers.provider.getBalance(deployer.address)

  console.log("═══════════════════════════════════════════════════")
  console.log("  TrustBox AI — Contract Deployment")
  console.log("  Network :", network)
  console.log("  Deployer:", deployer.address)
  console.log("  Balance :", hre.ethers.formatEther(balance), "AVAX")
  console.log("═══════════════════════════════════════════════════\n")

  if (hre.ethers.formatEther(balance) === "0.0") {
    console.error("❌ Deployer has no AVAX. Get testnet AVAX from https://faucet.avax.network")
    process.exit(1)
  }

  const deployed: Record<string, string> = {}

  // ── 1. TrustRegistry (ERC-8004) ──────────────────────────────
  console.log("📦 Deploying TrustRegistry...")
  const TrustRegistryFactory = await hre.ethers.getContractFactory("TrustRegistry")
  const trustRegistry        = await TrustRegistryFactory.deploy()
  await trustRegistry.waitForDeployment()
  deployed.trustRegistry     = await trustRegistry.getAddress()
  console.log("  ✅ TrustRegistry:", deployed.trustRegistry)

  // ── 2. AuditRegistry ─────────────────────────────────────────
  console.log("\n📦 Deploying AuditRegistry...")
  const AuditRegistryFactory = await hre.ethers.getContractFactory("AuditRegistry")
  const auditRegistry        = await AuditRegistryFactory.deploy()
  await auditRegistry.waitForDeployment()
  deployed.auditRegistry     = await auditRegistry.getAddress()
  console.log("  ✅ AuditRegistry:", deployed.auditRegistry)

  // ── 3. IntentVault ────────────────────────────────────────────
  console.log("\n📦 Deploying IntentVault...")
  const IntentVaultFactory = await hre.ethers.getContractFactory("IntentVault")
  const intentVault        = await IntentVaultFactory.deploy()
  await intentVault.waitForDeployment()
  deployed.intentVault     = await intentVault.getAddress()
  console.log("  ✅ IntentVault:", deployed.intentVault)

  // ── 4. AgentMarketplace ───────────────────────────────────────
  console.log("\n📦 Deploying AgentMarketplace...")
  const AgentMarketplaceFactory = await hre.ethers.getContractFactory("AgentMarketplace")
  const agentMarketplace        = await AgentMarketplaceFactory.deploy()
  await agentMarketplace.waitForDeployment()
  deployed.agentMarketplace     = await agentMarketplace.getAddress()
  console.log("  ✅ AgentMarketplace:", deployed.agentMarketplace)

  // ── Post-deployment setup ─────────────────────────────────────
  console.log("\n🔧 Post-deployment setup...")

  const creExecutorAddr = process.env.CRE_EXECUTOR_ADDRESS
  if (creExecutorAddr) {
    console.log("  Adding CRE executor to IntentVault:", creExecutorAddr)
    const tx = await (intentVault as any).addExecutor(creExecutorAddr)
    await tx.wait()
    console.log("  ✅ CRE executor added")
  } else {
    console.log("  ⚠️  CRE_EXECUTOR_ADDRESS not set — add manually after CRE deployment")
  }

  // ── Save addresses ────────────────────────────────────────────
  const outputDir  = path.resolve(__dirname, "../../deployments")
  const outputFile = path.join(outputDir, `${network}.json`)

  fs.mkdirSync(outputDir, { recursive: true })

  const deployment = {
    network,
    chainId:    (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployedAt: new Date().toISOString(),
    deployer:   deployer.address,
    contracts:  deployed,
  }

  fs.writeFileSync(outputFile, JSON.stringify(deployment, null, 2))
  console.log("\n📄 Addresses saved to:", outputFile)

  // Also update the CRE workflow config.json automatically
  const creConfigPath = path.resolve(
    __dirname,
    "../../trustboxx-ai/my-workflow/config.json"
  )

  if (fs.existsSync(creConfigPath)) {
    const creConfig = JSON.parse(fs.readFileSync(creConfigPath, "utf-8"))
    creConfig.contracts.trustRegistry    = deployed.trustRegistry
    creConfig.contracts.auditRegistry    = deployed.auditRegistry
    creConfig.contracts.intentVault      = deployed.intentVault
    creConfig.contracts.agentMarketplace = deployed.agentMarketplace
    fs.writeFileSync(creConfigPath, JSON.stringify(creConfig, null, 2))
    console.log("  ✅ CRE config.json updated with live addresses")
  }

  // ── Summary ───────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════")
  console.log("  ✅ All contracts deployed!")
  console.log("═══════════════════════════════════════════════════")
  console.log("  TrustRegistry   :", deployed.trustRegistry)
  console.log("  AuditRegistry   :", deployed.auditRegistry)
  console.log("  IntentVault     :", deployed.intentVault)
  console.log("  AgentMarketplace:", deployed.agentMarketplace)
  console.log("\n  🔗 Verify on Snowtrace Fuji:")
  Object.entries(deployed).forEach(([name, addr]) => {
    console.log(`  ${name.padEnd(18)}: https://testnet.snowtrace.io/address/${addr}`)
  })
  console.log("\n  📋 Next steps:")
  console.log("  1. ✅ CRE config.json updated automatically")
  console.log("  2. Update frontend src/constants/chains.js with new addresses")
  console.log("  3. Fund deployer wallet with AVAX: https://faucet.avax.network")
  console.log("  4. Set CRE_EXECUTOR_ADDRESS in .env after CRE workflow is live")
  console.log("═══════════════════════════════════════════════════\n")
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err.message || err)
  process.exit(1)
})