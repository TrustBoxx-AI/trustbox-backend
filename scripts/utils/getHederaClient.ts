/* scripts/utils/getHederaClient.ts
   Shared Hedera client factory with automatic key-type detection.
   Supports: DER-encoded (ECDSA + ED25519), raw hex, 0x-prefixed hex.
   ──────────────────────────────────────────────────────────────── */

import * as dotenv from "dotenv";
dotenv.config();

export async function getHederaClient() {
  const { Client, AccountId, PrivateKey } = await import("@hashgraph/sdk");

  const operatorId  = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error(
      "HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env\n" +
      "Get a free testnet account at: https://portal.hedera.com"
    );
  }

  const raw = operatorKey.trim();
  let privateKey: any;

  if (raw.startsWith("302e") || raw.startsWith("3026") ||
      raw.startsWith("3030") || raw.startsWith("3077")) {
    // DER-encoded (ED25519 or ECDSA)
    privateKey = PrivateKey.fromStringDer(raw);
  } else if (raw.startsWith("0x")) {
    // EVM-style — strip 0x prefix
    privateKey = PrivateKey.fromStringECDSA(raw.slice(2));
  } else if (raw.length === 64) {
    // Raw 32-byte hex — Hedera Portal default is ECDSA
    try { privateKey = PrivateKey.fromStringECDSA(raw); }
    catch { privateKey = PrivateKey.fromStringED25519(raw); }
  } else {
    // Unknown format — let SDK attempt detection
    privateKey = PrivateKey.fromString(raw);
  }

  const client = Client.forTestnet();
  client.setOperator(AccountId.fromString(operatorId), privateKey);
  return { client, privateKey, AccountId, PrivateKey };
}