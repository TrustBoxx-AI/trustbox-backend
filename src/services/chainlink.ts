/* services/chainlink.ts — TrustBox
   Chainlink Functions (NL intent parse) + Price Feed reads.
   FunctionsConsumer.sol is deployed in Session 5.
   ─────────────────────────────────────────────────────── */

import { ethers }         from "ethers";
import { SecretsManager } from "@chainlink/functions-toolkit";
import { readFileSync }   from "fs";
import { join }           from "path";
import { env }            from "../config/env";
import { CHAINLINK }      from "../config/chains";
import { getFunctionsConsumer, getPriceFeed, provider, signer, waitForEvent } from "./ethers";

// ── Load JS source once ───────────────────────────────────────
const PARSE_INTENT_SOURCE = readFileSync(
  join(__dirname, "../../functions/source/parseIntent.js"),
  "utf8"
);

// ── Build encrypted secrets reference ────────────────────────
async function buildSecretsRef(): Promise<string> {
  if (!CHAINLINK.secretsVersion) {
    throw new Error("CHAINLINK_SECRETS_VERSION not set — run: npm run encrypt:secrets");
  }
  const sm = new SecretsManager({
    signer,
    functionsRouterAddress: CHAINLINK.routerAddress,
    donId: CHAINLINK.donId,
  });
  await sm.initialize();
  const ref = await sm.buildDONHostedEncryptedSecretsReference({
    slotId:  0,
    version: CHAINLINK.secretsVersion,
  });
  return ref;
}

// ── Parse NL intent text via Chainlink Functions ─────────────
export async function parseIntent(
  nlText:   string,
  category: string
): Promise<{
  specJson:   string;
  specHash:   string;
  requestId:  string;
}> {
  const consumer  = getFunctionsConsumer();
  const encRef    = await buildSecretsRef();
  const gasConfig = await import("./ethers").then(m => m.getGasConfig());

  console.log(`[chainlink] Sending Functions request — category: ${category}`);

  const tx = await consumer.sendParseRequest(
    PARSE_INTENT_SOURCE,
    [encodeURIComponent(nlText), category],
    encRef,
    { ...gasConfig }
  );

  const receipt = await tx.wait(1);
  console.log(`[chainlink] Request tx confirmed: ${receipt.hash}`);

  // Wait for fulfillRequest callback (DON typically 10–30s on Fuji)
  const [requestId, specJson] = await waitForEvent<[string, string, string]>(
    consumer,
    "IntentParsed",
    90_000 // 90s timeout
  );

  const specHash = ethers.keccak256(ethers.toUtf8Bytes(specJson));
  console.log(`[chainlink] Intent parsed — specHash: ${specHash}`);

  return { specJson, specHash, requestId };
}

// ── Price feed reads ─────────────────────────────────────────
interface PriceResult {
  price:     number;   // USD value (decimal)
  rawAnswer: bigint;   // on-chain value (8 decimals)
  updatedAt: number;   // unix timestamp
  age:       number;   // seconds since last update
}

async function readFeed(address: string, name: string): Promise<PriceResult> {
  const feed = getPriceFeed(address);
  const { answer, updatedAt } = await feed.latestRoundData();

  const age = Math.floor(Date.now() / 1000) - Number(updatedAt);
  if (age > 3600) {
    throw new Error(`${name} price feed stale — last updated ${age}s ago`);
  }
  if (answer <= 0n) {
    throw new Error(`${name} price feed returned invalid answer: ${answer}`);
  }

  return {
    price:     Number(answer) / 1e8,
    rawAnswer: answer,
    updatedAt: Number(updatedAt),
    age,
  };
}

export async function getAvaxUsdPrice()  { return readFeed(CHAINLINK.priceFeeds.avaxUsd, "AVAX/USD"); }
export async function getEthUsdPrice()   { return readFeed(CHAINLINK.priceFeeds.ethUsd,  "ETH/USD");  }
export async function getBtcUsdPrice()   { return readFeed(CHAINLINK.priceFeeds.btcUsd,  "BTC/USD");  }

export async function getAllPrices() {
  const [avax, eth, btc] = await Promise.all([
    getAvaxUsdPrice(),
    getEthUsdPrice(),
    getBtcUsdPrice(),
  ]);
  return { avax, eth, btc };
}
