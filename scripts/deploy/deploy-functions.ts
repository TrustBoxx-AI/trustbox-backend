
import * as hre from "hardhat"
import * as fs  from "fs"
import * as path from "path"

const FUJI_ROUTER = "0xA9d587a00A31A52Ed70D6026794a8FC5E2F5dCb0"
const FUJI_DON_ID = hre.ethers.encodeBytes32String("fun-avalanche-fuji-1")

async function main() {
  const [deployer] = await hre.ethers.getSigners()

  const subscriptionId = process.env.CHAINLINK_SUBSCRIPTION_ID
  if (!subscriptionId) {
    console.error("❌ CHAINLINK_SUBSCRIPTION_ID not set in .env")
    console.error("   Create a subscription at: https://functions.chain.link")
    process.exit(1)
  }

  console.log("═══════════════════════════════════════════════════")
  console.log("  TrustBox — FunctionsConsumer Deployment")
  console.log("  Deployer     :", deployer.address)
  console.log("  Subscription :", subscriptionId)
  console.log("  Network      : Avalanche Fuji")
  console.log("═══════════════════════════════════════════════════\n")

  const Factory  = await hre.ethers.getContractFactory("FunctionsConsumer")
  const consumer = await Factory.deploy(
    FUJI_ROUTER,
    FUJI_DON_ID,
    Number(subscriptionId)
  )

  await consumer.waitForDeployment()
  const address = await consumer.getAddress()

  console.log(`✅ FunctionsConsumer deployed: ${address}`)
  console.log(`   Explorer: https://testnet.snowtrace.io/address/${address}`)

  // ── Update .env ───────────────────────────────────────────
  const envPath    = path.resolve(__dirname, "../../.env")
  let   envContent = fs.readFileSync(envPath, "utf-8")

  const key   = "FUNCTIONS_CONSUMER_ADDR"
  const regex = new RegExp(`^${key}=.*$`, "m")
  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `${key}=${address}`)
  } else {
    envContent += `\n${key}=${address}`
  }
  fs.writeFileSync(envPath, envContent)

  // ── Update deployments/fuji.json ──────────────────────────
  const deploymentsPath = path.resolve(__dirname, "../../deployments/fuji.json")
  let   deployments: any = {}
  if (fs.existsSync(deploymentsPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"))
  }

  deployments.FunctionsConsumer = {
    address,
    deployedAt:  new Date().toISOString(),
    deployer:    deployer.address,
    network:     "avalanche-fuji",
    subscriptionId,
  }

  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2))

  console.log("\n  ✅ .env and deployments/fuji.json updated")
  console.log("\n  ⚠️  Next steps:")
  console.log(`  1. Add consumer to subscription: https://functions.chain.link`)
  console.log(`     Consumer address: ${address}`)
  console.log(`  2. Upload secrets: npm run encrypt:secrets`)
  console.log("═══════════════════════════════════════════════════\n")
}

main().catch(err => {
  console.error("❌ Deployment failed:", err.message)
  process.exit(1)
})
