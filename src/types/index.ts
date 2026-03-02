/* types/index.ts — TrustBox Backend
   Shared types — these mirror the MOCK_PROOFS and MOCK_FINDINGS
   shapes in the frontend constants/index.js.
   Session 12 replaces all mocks with these real response types.
   ─────────────────────────────────────────────────────── */

// ── Finding (one item in findings array) ────────────────────────
export interface Finding {
  label:  string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

// ── Proof types — one per action, matching MOCK_PROOFS shapes ────

export interface VerifyProof {
  chain:        "avalanche";
  standard:     "ERC-8004";
  tokenId:      string;
  contractAddr: string;
  metadataURI:  string;
  mintTxHash:   string;
  blockNumber:  string;
  gasUsed:      string;
  mintedAt:     string;
  explorerUrl:  string;
  tokenExplorer:string;
  agentScore:   number;
  issuer:       string;
}

export interface AuditProof {
  chain:           "avalanche";
  registryAddr:    string;
  txHash:          string;
  blockNumber:     string;
  gasUsed:         string;
  auditedContract: string;
  reportCID:       string;
  reportHash:      string;
  merkleRoot:      string;
  auditedAt:       string;
  explorerUrl:     string;
  registryUrl:     string;
  score:           number;
  standard:        string;
}

export interface ScoreProof {
  chain:        "hedera";
  topicId:      string;
  sequenceNum:  string;
  inputHash:    string;
  outputHash:   string;
  receiptCID:   string;
  timestamp:    string;
  explorerUrl:  string;
  modelVersion: string;
  proofType:    "ZK-SNARK (Groth16)";
  htsTokenId?:  string;
  htsSerial?:   string;
}

export interface BlindAuditProof {
  chain:          "avalanche";
  txHash:         string;
  blockNumber:    string;
  agentId:        string;
  inputHash:      string;
  attestationCID: string;
  timestamp:      string;
  explorerUrl:    string;
  teeProvider:    string;
  scannerVersion: string;
}

export interface ScanProof {
  score:       number;
  signedAt:    string;
  serverSig:   string;
  modelVersion:string;
}

export interface ExecuteProof {
  chain:         "both";
  avaxTxHash:    string;
  hederaTopicId: string;
  nlHash:        string;
  specHash:      string;
  executionHash: string;
  chainlinkJobId:string;
  timestamp:     string;
  avaxExplorer:  string;
  hederaExplorer:string;
}

export type AnyProof = VerifyProof | AuditProof | ScoreProof | BlindAuditProof | ScanProof | ExecuteProof;

// ── API response wrapper ─────────────────────────────────────────
export interface ApiSuccess<T> {
  ok:     true;
  data:   T;
  timing: number; // ms
}

export interface ApiError {
  ok:      false;
  code:    string;
  message: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ── Action result (findings + proof + score) ─────────────────────
export interface ActionResult<P extends AnyProof = AnyProof> {
  action:   string;
  score:    number | null;
  findings: Finding[];
  proof:    P;
  logs:     string[]; // real log lines to replace LOG_LINES mocks
}

// ── Intent types ─────────────────────────────────────────────────
export interface IntentSpec {
  action:        string;
  confidence:    number;
  params:        Record<string, unknown>;
  verification:  string;
  execution:     string;
  estimatedCost: string;
}

export interface ParsedIntent {
  specJson:  string;
  specHash:  string;   // keccak256 of specJson
  requestId: string;   // Chainlink requestId
  spec:      IntentSpec;
}

export interface SubmittedIntent {
  intentId:      string;
  submitTxHash:  string;
  approveTxHash: string;
  status:        "PENDING" | "APPROVED" | "EXECUTING" | "EXECUTED" | "FAILED";
}

// ── ZK proof types ───────────────────────────────────────────────
export interface ZKProof {
  proof:         Record<string, unknown>; // snarkjs Groth16 proof
  publicSignals: string[];
  scoreHash:     string;
  scoreBand:     1 | 2 | 3 | 4;   // 1=Poor 2=Fair 3=Good 4=Excellent
}

// ── Credit score input ───────────────────────────────────────────
export interface CreditScoreInput {
  paymentHistory:  boolean[];     // 12 months
  debtToIncome:    number;        // 0–100
  utilisation:     number;        // 0–100
  incomeRange:     1 | 2 | 3 | 4 | 5; // encoded
  debtCategories:  string[];
  employmentStatus:string;
}

// ── Agent ────────────────────────────────────────────────────────
export interface Agent {
  id:          string;
  name:        string;
  operator:    string;
  version:     string;
  teeProvider: string;
  capabilities:string[];
  languages:   string[];
  auditCount:  number;
  avgScore:    number;
  stake:       string;
  responseTime:string;
  encPubKey:   string;
  teeEndpoint: string;
  status:      "online" | "busy" | "offline";
  badge:       string;
}
