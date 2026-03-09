
export interface Agent {
  id:            string
  name:          string
  operator:      string
  description?:  string
  capabilities:  string[]
  teeEndpoint:   string
  teeProvider?:  string
  stake:         string
  avgScore:      number
  status:        "online" | "offline" | "degraded" | "busy"
  version?:      string
  languages?:    string[]
  auditCount?:   number
  responseTime?: string
  encPubKey?:    string
  badge?:        string
  createdAt?:    string
  [key: string]: unknown
}
// ── Intent ────────────────────────────────────────────────────
export type IntentCategory = "Travel Booking" | "Portfolio Rebalance" | "Contributor Tip"

export interface IntentSpec {
  action: string
  entity: string
  params: Record<string, unknown>
}

export interface Intent {
  intentId:    string
  submitter:   string
  spec:        IntentSpec
  category:    IntentCategory
  status:      "Pending" | "Executing" | "Completed" | "Failed"
  resultCID:   string
  success:     boolean
  submittedAt: number
  executedAt:  number
}

// ── Credit Score ──────────────────────────────────────────────
export interface CreditScore {
  walletAddress: string
  score:         number
  scoreBand:     number
  scoreHash:     string
  zkProofCID:    string
  hcsMessageId:  string
  modelVersion:  string
  timestamp:     string
}

// ── Audit ─────────────────────────────────────────────────────
export interface AuditRecord {
  contractAddress: string
  reportHash:      string
  reportCID:       string
  score:           number
  auditor:         string
  timestamp:       string
}

// ── TEE Job ───────────────────────────────────────────────────
export interface TEEJob {
  jobId:           string
  agentId:         string
  findingsHash:    string
  attestationCID:  string
  attestationQuote: string
  teeProvider:     string
  timestamp:       string
}

// ── API responses ─────────────────────────────────────────────
export interface ApiOk<T = object> {
  ok:   true
  data: T
}

export interface ApiError {
  ok:      false
  code:    string
  message: string
}

export type ApiResponse<T = object> = ApiOk<T> | ApiError
