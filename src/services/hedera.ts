/* services/hedera.ts — TrustBox
   Hedera SDK — HCS topic submissions + HTS NFT minting.
   All Hedera operations are server-side only.
   ─────────────────────────────────────────────────── */

import {
  Client,
  AccountId,
  PrivateKey,
  TopicMessageSubmitTransaction,
  TopicId,
  TokenMintTransaction,
  TokenId,
  TransferTransaction,
  AccountCreateTransaction,
  Hbar,
  TokenAssociateTransaction,
} from "@hashgraph/sdk";
import { HEDERA_CONFIG } from "../config/chains";

// ── Client singleton ─────────────────────────────────────────
let _client: Client | null = null;

function getClient(): Client {
  if (!HEDERA_CONFIG.operatorId || !HEDERA_CONFIG.operatorKey) {
    throw new Error("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env");
  }
  if (!_client) {
    _client = Client.forTestnet();
    _client.setOperator(
      AccountId.fromString(HEDERA_CONFIG.operatorId),
      PrivateKey.fromString(HEDERA_CONFIG.operatorKey)
    );
  }
  return _client;
}

// ── HCS: Submit message to topic ────────────────────────────
export async function submitHCSMessage(
  topicId: string,
  payload: object
): Promise<{ sequenceNumber: string; consensusTimestamp: string }> {
  const client  = getClient();
  const message = JSON.stringify(payload);

  const tx      = new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setMessage(message);

  const receipt = await (await tx.execute(client)).getReceipt(client);

  const seqNum    = receipt.topicSequenceNumber?.toString() ?? "0";
  const timestamp = new Date().toISOString();

  console.log(`[hedera] HCS message submitted — topic: ${topicId} seq: ${seqNum}`);

  return {
    sequenceNumber:    seqNum,
    consensusTimestamp: timestamp,
  };
}

// ── HCS: Submit credit score trail ──────────────────────────
export async function submitCreditScoreTrail(data: {
  walletAddress: string;
  scoreHash:     string;
  zkProofCID:    string;
  scoreBand:     number;
  modelVersion:  string;
}) {
  const topicId = HEDERA_CONFIG.topics.creditScore;
  if (!topicId) throw new Error("HCS_CREDIT_TOPIC_ID not set in .env");

  return submitHCSMessage(topicId, {
    type:       "credit_score",
    ...data,
    timestamp:  new Date().toISOString(),
  });
}

// ── HCS: Submit intent execution trail ──────────────────────
export async function submitIntentTrail(data: {
  intentId:      string;
  nlHash:        string;
  specHash:      string;
  userSig:       string;
  executionHash: string;
  category:      string;
  avaxTxHash:    string;
}) {
  const topicId = HEDERA_CONFIG.topics.intentExecution;
  if (!topicId) throw new Error("HCS_INTENT_TOPIC_ID not set in .env");

  return submitHCSMessage(topicId, {
    type:       "intent_execution",
    ...data,
    timestamp:  new Date().toISOString(),
  });
}

// ── HTS: Mint credit credential NFT ─────────────────────────
export async function mintCreditNFT(
  recipientAccountId: string,
  metadata: {
    walletAddress: string;
    score:         number;
    scoreBand:     number;
    zkProofCID:    string;
    hcsSeqNum:     string;
    modelVersion:  string;
    timestamp:     string;
  }
): Promise<{ tokenId: string; serial: number; explorerUrl: string }> {
  const client  = getClient();
  const tokenId = HEDERA_CONFIG.tokens.creditNFT;
  if (!tokenId) throw new Error("HTS_CREDIT_TOKEN_ID not set — run scripts/utils/createHtsToken.ts first");

  const metadataBytes = Buffer.from(JSON.stringify(metadata));

  // Mint the NFT
  const mintTx = await new TokenMintTransaction()
    .setTokenId(TokenId.fromString(tokenId))
    .addMetadata(metadataBytes)
    .execute(client);

  const mintReceipt = await mintTx.getReceipt(client);
  const serial      = Number(mintReceipt.serials[0]);

  console.log(`[hedera] HTS NFT minted — token: ${tokenId} serial: ${serial}`);

  // Transfer to recipient
  try {
    const transferTx = await new TransferTransaction()
      .addNftTransfer(
        TokenId.fromString(tokenId),
        serial,
        AccountId.fromString(HEDERA_CONFIG.operatorId!),
        AccountId.fromString(recipientAccountId)
      )
      .execute(client);

    await transferTx.getReceipt(client);
    console.log(`[hedera] NFT transferred to ${recipientAccountId}`);
  } catch (err: any) {
    // Token not associated — user needs to associate first
    if (err.message?.includes("TOKEN_NOT_ASSOCIATED_TO_ACCOUNT")) {
      console.warn(`[hedera] Recipient ${recipientAccountId} has not associated the token — NFT stays with operator`);
    } else {
      throw err;
    }
  }

  return {
    tokenId,
    serial,
    explorerUrl: `${HEDERA_CONFIG.explorer}/token/${tokenId}/${serial}`,
  };
}

// ── Mirror node: Fetch HCS message ──────────────────────────
export async function fetchHCSMessage(
  topicId:       string,
  sequenceNumber: string
): Promise<object | null> {
  const url = `${HEDERA_CONFIG.mirrorNode}/api/v1/topics/${topicId}/messages/${sequenceNumber}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data: any = await res.json();
  // Messages are base64 encoded
  const decoded = Buffer.from(data.message, "base64").toString("utf8");
  return JSON.parse(decoded);
}

// ── Mirror node: Verify NFT metadata ────────────────────────
export async function fetchNFTMetadata(
  tokenId: string,
  serial:  number
): Promise<object | null> {
  const url = `${HEDERA_CONFIG.mirrorNode}/api/v1/tokens/${tokenId}/nfts/${serial}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}
