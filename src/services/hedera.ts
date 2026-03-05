/* services/hedera.ts — TrustBox
   Hedera SDK — lazy loaded to avoid bcrypto native binding crash on startup.
   All Hedera operations are server-side only.
   ─────────────────────────────────────────────────────────────────────── */

import { HEDERA_CONFIG } from "../config/chains";

// ── Lazy client — only loads @hashgraph/sdk when first called ──
let _client: any = null;

async function getClient(): Promise<any> {
  if (!HEDERA_CONFIG.operatorId || !HEDERA_CONFIG.operatorKey) {
    throw new Error("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env");
  }
  if (!_client) {
    const {
      Client,
      AccountId,
      PrivateKey,
    } = await import("@hashgraph/sdk");

    _client = Client.forTestnet();
    _client.setOperator(
      AccountId.fromString(HEDERA_CONFIG.operatorId),
      PrivateKey.fromString(HEDERA_CONFIG.operatorKey)
    );
  }
  return _client;
}

// ── HCS: Submit message to topic ─────────────────────────────
export async function submitHCSMessage(
  topicId: string,
  payload: object
): Promise<{ sequenceNumber: string; consensusTimestamp: string }> {
  const { TopicMessageSubmitTransaction, TopicId } = await import("@hashgraph/sdk");
  const client  = await getClient();
  const message = JSON.stringify(payload);

  const tx      = new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setMessage(message);

  const receipt = await (await tx.execute(client)).getReceipt(client);
  const seqNum  = receipt.topicSequenceNumber?.toString() ?? "0";

  console.log(`[hedera] HCS message — topic: ${topicId} seq: ${seqNum}`);
  return { sequenceNumber: seqNum, consensusTimestamp: new Date().toISOString() };
}

// ── HCS: Submit credit score trail ───────────────────────────
export async function submitCreditScoreTrail(data: {
  walletAddress: string;
  scoreHash:     string;
  zkProofCID:    string;
  scoreBand:     number;
  modelVersion:  string;
}) {
  const topicId = HEDERA_CONFIG.topics.creditScore;
  if (!topicId) throw new Error("HCS_CREDIT_TOPIC_ID not set in .env");
  return submitHCSMessage(topicId, { type: "credit_score", ...data, timestamp: new Date().toISOString() });
}

// ── HCS: Submit intent execution trail ───────────────────────
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
  return submitHCSMessage(topicId, { type: "intent_execution", ...data, timestamp: new Date().toISOString() });
}

// ── HTS: Mint credit credential NFT ──────────────────────────
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
  const { TokenMintTransaction, TokenId, TransferTransaction, AccountId } = await import("@hashgraph/sdk");
  const client  = await getClient();
  const tokenId = HEDERA_CONFIG.tokens.creditNFT;
  if (!tokenId) throw new Error("HTS_CREDIT_TOKEN_ID not set");

  const metadataBytes = Buffer.from(JSON.stringify(metadata));

  const mintTx      = await new TokenMintTransaction()
    .setTokenId(TokenId.fromString(tokenId))
    .addMetadata(metadataBytes)
    .execute(client);

  const mintReceipt = await mintTx.getReceipt(client);
  const serial      = Number(mintReceipt.serials[0]);

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
  } catch (err: any) {
    if (!err.message?.includes("TOKEN_NOT_ASSOCIATED_TO_ACCOUNT")) throw err;
    console.warn(`[hedera] Recipient not associated — NFT stays with operator`);
  }

  return { tokenId, serial, explorerUrl: `${HEDERA_CONFIG.explorer}/token/${tokenId}/${serial}` };
}

// ── Mirror node: Fetch HCS message ───────────────────────────
export async function fetchHCSMessage(
  topicId:        string,
  sequenceNumber: string
): Promise<object | null> {
  const url = `${HEDERA_CONFIG.mirrorNode}/api/v1/topics/${topicId}/messages/${sequenceNumber}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data: any = await res.json();
return JSON.parse(Buffer.from(data.message, "base64").toString("utf8")) as object;
}

// ── Mirror node: Verify NFT metadata ─────────────────────────
export async function fetchNFTMetadata(tokenId: string, serial: number): Promise<object | null> {
  const url = `${HEDERA_CONFIG.mirrorNode}/api/v1/tokens/${tokenId}/nfts/${serial}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json() as Promise<object>;
}