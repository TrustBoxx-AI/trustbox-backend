/* services/chainlink.ts — TrustBox

   FIX H-08: Removed the duplicate provider + signer instantiation.
   Now imports the shared instances from services/ethers.ts so there is
   a single JSON-RPC connection with unified nonce tracking across all
   concurrent transactions (audit, intent, verify).
*/

import { ethers }  from "ethers"
import { env }     from "../config/env"
import { CONTRACTS, loadAbi } from "../config/chains"
import { provider, signer } from "./ethers"   // FIX H-08: shared instances only
import * as fs     from "fs"
import * as path   from "path"

function getConsumer() {
  if (!CONTRACTS.functionsConsumer) throw new Error("FUNCTIONS_CONSUMER_ADDR not set in .env")
  return new ethers.Contract(CONTRACTS.functionsConsumer, loadAbi("FunctionsConsumer"), signer)
}

function loadSource(): string {
  const candidates = [
    path.resolve(__dirname, "../../functions/source/parseIntent.js"),
    path.resolve(__dirname, "../functions/source/parseIntent.js"),
    path.resolve(process.cwd(), "functions/source/parseIntent.js"),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8")
  }
  throw new Error("parseIntent.js not found — expected at functions/source/parseIntent.js")
}

export async function sendParseRequest(nlText: string, category: string) {
  const consumer  = getConsumer()
  const source    = loadSource()
  const feeData   = await provider.getFeeData()
  const gasConfig = {
    maxFeePerGas:         feeData.maxFeePerGas         ?? ethers.parseUnits("30", "gwei"),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? ethers.parseUnits("2",  "gwei"),
  }

  // Pass the live CHAINLINK_SECRETS_VERSION so the DON resolves the correct secrets slot
  const secretsVersion = env.CHAINLINK_SECRETS_VERSION ? Number(env.CHAINLINK_SECRETS_VERSION) : 0
  const encryptedSecretsRef = secretsVersion > 0
    ? ethers.toUtf8Bytes(JSON.stringify({ slotId: 0, version: secretsVersion }))
    : "0x"

  const tx      = await consumer.sendParseRequest(
    source,
    [encodeURIComponent(nlText), category],
    encryptedSecretsRef,
    gasConfig
  )
  const receipt = await tx.wait(1)
  let requestId = ""
  for (const log of receipt.logs) {
    try {
      const parsed = consumer.interface.parseLog(log)
      if (parsed?.name === "RequestSent") requestId = parsed.args.requestId
    } catch { /* skip */ }
  }
  return { requestId, txHash: receipt.hash }
}

export async function pollForResult(requestId: string, timeoutMs = 120_000) {
  const consumer  = getConsumer()
  const startTime = Date.now()
  while (Date.now() - startTime < timeoutMs) {
    const spec  = await consumer.getSpec(requestId)
    const error = await consumer.getError(requestId)
    if (spec && spec !== "") return { specJson: spec, error: null }
    if (error && error !== "0x") return { specJson: "", error: Buffer.from(error.slice(2), "hex").toString() }
    await new Promise(r => setTimeout(r, 3000))
  }
  throw new Error(`Chainlink Functions timeout for requestId: ${requestId}`)
}

export async function parseIntent(nlText: string, category: string): Promise<{
  specJson:  string
  specHash:  string
  requestId: string
}> {
  const { requestId }       = await sendParseRequest(nlText, category)
  const { specJson, error } = await pollForResult(requestId)
  if (error) throw new Error(`Chainlink Functions error: ${error}`)
  const specHash = ethers.id(specJson)
  return { specJson, specHash, requestId }
}

export const parseIntentViaChainlink = parseIntent
