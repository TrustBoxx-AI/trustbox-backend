

import { HEDERA_CONFIG } from "../config/chains";

// ── Lazy client ───────────────────────────────────────────────
let _client: any = null;

async function getClient(): Promise<any> {
  if (!HEDERA_CONFIG.operatorId || !HEDERA_CONFIG.operatorKey) {
    throw new Error(
      "HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env\n" +
      "  Get a free testnet account at: https://portal.hedera.com"
    );
  }
  if (!_client) {
    const { Client, AccountId, PrivateKey } = await import("@hashgraph/sdk");
    _client = Client.forTestnet();
    // Auto-detect key format to avoid INVALID_SIGNATURE
    const rawKey = HEDERA_CONFIG.operatorKey!;
    let privateKey: any;
    if (rawKey.startsWith("302e") || rawKey.startsWith("3026") ||
        rawKey.startsWith("3030") || rawKey.startsWith("3077")) {
      privateKey = PrivateKey.fromStringDer(rawKey);
    } else if (rawKey.startsWith("0x")) {
      privateKey = PrivateKey.fromStringECDSA(rawKey.slice(2));
    } else {
      try { privateKey = PrivateKey.fromStringECDSA(rawKey); }
      catch { privateKey = PrivateKey.fromStringED25519(rawKey); }
    }
    _client.setOperator(
      AccountId.fromString(HEDERA_CONFIG.operatorId),
      privateKey
    );
    // Increase timeout for Render cold-start latency
    _client.setRequestTimeout(30_000);
  }
  return _client;
}

// ── HCS: Generic message submit ───────────────────────────────
export async function submitHCSMessage(
  topicId: string,
  payload: object
): Promise<{ sequenceNumber: string; consensusTimestamp: string; explorerUrl: string }> {
  const { TopicMessageSubmitTransaction, TopicId } = await import("@hashgraph/sdk");
  const client  = await getClient();
  const message = JSON.stringify(payload);

  const tx      = new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setMessage(message)
    .setMaxChunks(20); // allow large payloads (ZK proof JSON can be ~4 KB)

  const receipt = await (await tx.execute(client)).getReceipt(client);
  const seqNum  = receipt.topicSequenceNumber?.toString() ?? "0";

  console.log(`[hedera] HCS message — topic: ${topicId} seq: ${seqNum}`);

  return {
    sequenceNumber:     seqNum,
    consensusTimestamp: new Date().toISOString(),
    explorerUrl:        `${HEDERA_CONFIG.explorer}/topic/${topicId}?sequenceNumber=${seqNum}`,
  };
}

// ── HCS: Credit score trail ───────────────────────────────────
export async function submitCreditScoreTrail(data: {
  walletAddress: string;
  scoreHash:     string;
  zkProofCID:    string;
  scoreBand:     number;
  modelVersion:  string;
}) {
  const topicId = HEDERA_CONFIG.topics.creditScore;
  if (!topicId) throw new Error("HCS_CREDIT_TOPIC_ID not set — run scripts/utils/createHcsTopics.ts");
  return submitHCSMessage(topicId, {
    type:      "credit_score",
    ...data,
    timestamp: new Date().toISOString(),
  });
}

// ── HCS: Audit report trail ───────────────────────────────────
export async function submitAuditTrail(data: {
  walletAddress:    string;
  contractAddress:  string;
  contractName:     string;
  reportCID:        string;
  reportHash:       string;
  merkleRoot:       string;
  score:            number;
  avaxTxHash:       string;
  findingCount:     number;
}) {
  const topicId = HEDERA_CONFIG.topics.auditTrail;
  if (!topicId) {
    // Non-fatal — audit route still works without HCS
    console.warn("[hedera] HCS_AUDIT_TOPIC_ID not set — skipping audit trail submission");
    return null;
  }
  return submitHCSMessage(topicId, {
    type:      "audit_report",
    ...data,
    timestamp: new Date().toISOString(),
  });
}

// ── HCS: Intent execution trail ───────────────────────────────
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
  if (!topicId) throw new Error("HCS_INTENT_TOPIC_ID not set — run scripts/utils/createHcsTopics.ts");
  return submitHCSMessage(topicId, {
    type:      "intent_execution",
    ...data,
    timestamp: new Date().toISOString(),
  });
}

// ── HCS: ERC-8004 agent verification trail ───────────────────
export async function submitAgentVerificationTrail(data: {
  walletAddress:  string;
  agentId:        string;
  tokenId:        string;
  modelHash:      string;
  capabilityHash: string;
  metadataCID:    string;
  avaxTxHash:     string;
  trustScore:     number;
  approvedBy:     string;
}) {
  const topicId = HEDERA_CONFIG.topics.agentVerification;
  if (!topicId) {
    console.warn("[hedera] HCS_AGENT_TOPIC_ID not set — skipping agent verification trail");
    return null;
  }
  return submitHCSMessage(topicId, {
    type:      "agent_verification",
    ...data,
    timestamp: new Date().toISOString(),
  });
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
  if (!tokenId) throw new Error("HTS_CREDIT_TOKEN_ID not set — run scripts/utils/createHtsToken.ts");

  // Metadata max is 100 bytes for HTS NFT — store CID only, full data is on IPFS
  const metaBytes = Buffer.from(JSON.stringify({
    zkCID:  metadata.zkProofCID,
    band:   metadata.scoreBand,
    seq:    metadata.hcsSeqNum,
    v:      metadata.modelVersion,
    ts:     metadata.timestamp,
  }));

  const mintTx      = await new TokenMintTransaction()
    .setTokenId(TokenId.fromString(tokenId))
    .addMetadata(metaBytes)
    .execute(client);

  const mintReceipt = await mintTx.getReceipt(client);
  const serial      = Number(mintReceipt.serials[0]);
  console.log(`[hedera] HTS NFT minted — token: ${tokenId} serial: ${serial}`);

  // Transfer to recipient if they have an account ID
  if (recipientAccountId && recipientAccountId.startsWith("0.0.")) {
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
      if (err.message?.includes("TOKEN_NOT_ASSOCIATED_TO_ACCOUNT")) {
        console.warn(`[hedera] ${recipientAccountId} has not associated the token — NFT stays with operator until claimed`);
      } else {
        throw err;
      }
    }
  }

  return {
    tokenId,
    serial,
    explorerUrl: `${HEDERA_CONFIG.explorer}/token/${tokenId}?serialNumber=${serial}`,
  };
}

// ── HTS: Associate token to account ──────────────────────────
// Called before transfer — users must associate the TrustBox NFT token to their Hedera account
export async function associateToken(accountId: string, accountPrivateKey: string): Promise<void> {
  const { TokenAssociateTransaction, TokenId, AccountId, PrivateKey } = await import("@hashgraph/sdk");
  const client  = await getClient();
  const tokenId = HEDERA_CONFIG.tokens.creditNFT;
  if (!tokenId) throw new Error("HTS_CREDIT_TOKEN_ID not set");

  const tx = await new TokenAssociateTransaction()
    .setAccountId(AccountId.fromString(accountId))
    .setTokenIds([TokenId.fromString(tokenId)])
    .freezeWith(client)
    .sign(PrivateKey.fromString(accountPrivateKey));

  await (await tx.execute(client)).getReceipt(client);
  console.log(`[hedera] Token ${tokenId} associated to ${accountId}`);
}

// ── Mirror Node: Fetch HCS message by sequence ───────────────
export async function fetchHCSMessage(
  topicId:        string,
  sequenceNumber: string
): Promise<object | null> {
  try {
    const url = `${HEDERA_CONFIG.mirrorNode}/api/v1/topics/${topicId}/messages/${sequenceNumber}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: any = await res.json();
    return JSON.parse(Buffer.from(data.message, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

// ── Mirror Node: Latest N messages from topic ─────────────────
export async function fetchLatestHCSMessages(
  topicId: string,
  limit    = 10
): Promise<any[]> {
  try {
    const url = `${HEDERA_CONFIG.mirrorNode}/api/v1/topics/${topicId}/messages?limit=${limit}&order=desc`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: any = await res.json();
    return (data.messages ?? []).map((m: any) => {
      try {
        return {
          sequenceNumber: m.sequence_number,
          consensusTimestamp: m.consensus_timestamp,
          payload: JSON.parse(Buffer.from(m.message, "base64").toString("utf8")),
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Mirror Node: Verify NFT ownership ────────────────────────
export async function fetchNFTMetadata(tokenId: string, serial: number): Promise<object | null> {
  try {
    const url = `${HEDERA_CONFIG.mirrorNode}/api/v1/tokens/${tokenId}/nfts/${serial}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: any = await res.json();
    // Decode metadata field from base64
    if (data.metadata) {
      data.decodedMetadata = JSON.parse(
        Buffer.from(data.metadata, "base64").toString("utf8")
      );
    }
    return data;
  } catch {
    return null;
  }
}

// ── Mirror Node: All NFTs owned by an account ─────────────────
export async function fetchAccountNFTs(
  accountId: string,
  tokenId?: string
): Promise<any[]> {
  try {
    const filter = tokenId ? `&token.id=${tokenId}` : "";
    const url    = `${HEDERA_CONFIG.mirrorNode}/api/v1/accounts/${accountId}/nfts?limit=25${filter}`;
    const res    = await fetch(url);
    if (!res.ok) return [];
    const data: any = await res.json();
    return data.nfts ?? [];
  } catch {
    return [];
  }
}
