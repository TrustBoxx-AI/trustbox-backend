/* services/supabase.ts — TrustBox Backend
   All Supabase DB operations.
   Uses service role key — full access, bypasses RLS.
   ─────────────────────────────────────────────────── */

import { createClient } from "@supabase/supabase-js"
import { env }          from "../config/env"

export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
)

// ── User ──────────────────────────────────────────────────────
export async function upsertUser(walletAddress: string) {
  const wallet = walletAddress.toLowerCase()
  const { data, error } = await supabase
    .from("users")
    .upsert({ wallet_address: wallet, last_seen: new Date().toISOString() },
             { onConflict: "wallet_address" })
    .select()
    .single()

  if (error) throw new Error(`upsertUser: ${error.message}`)
  return data
}

export async function getUser(walletAddress: string) {
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("wallet_address", walletAddress.toLowerCase())
    .single()
  return data
}

export async function updateUser(walletAddress: string, updates: {
  ens_name?:      string
  hedera_account?: string
  metadata?:      object
}) {
  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("wallet_address", walletAddress.toLowerCase())
    .select()
    .single()

  if (error) throw new Error(`updateUser: ${error.message}`)
  return data
}

// ── Sessions ──────────────────────────────────────────────────
export async function createSession(walletAddress: string, jti: string, expiresAt: Date) {
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      wallet_address: walletAddress.toLowerCase(),
      jwt_jti:        jti,
      expires_at:     expiresAt.toISOString(),
    })
    .select()
    .single()

  if (error) throw new Error(`createSession: ${error.message}`)
  return data
}

export async function validateSession(jti: string): Promise<boolean> {
  const { data } = await supabase
    .from("sessions")
    .select("id, revoked, expires_at")
    .eq("jwt_jti", jti)
    .single()

  if (!data) return false
  if (data.revoked) return false
  if (new Date(data.expires_at) < new Date()) return false
  return true
}

export async function revokeSession(jti: string) {
  await supabase.from("sessions").update({ revoked: true }).eq("jwt_jti", jti)
}

// ── Credit Scores ─────────────────────────────────────────────
export async function saveScore(data: {
  walletAddress:  string
  score:          number
  scoreBand:      number
  scoreHash:      string
  zkProofCID?:    string
  hcsMessageId?:  string
  tokenId?:       string
  txHash?:        string
  modelVersion?:  string
  explorerUrl?:   string
}) {
  const { data: row, error } = await supabase
    .from("credit_scores")
    .insert({
      wallet_address:  data.walletAddress.toLowerCase(),
      score:           data.score,
      score_band:      data.scoreBand,
      score_hash:      data.scoreHash,
      zk_proof_cid:    data.zkProofCID,
      hcs_message_id:  data.hcsMessageId,
      token_id:        data.tokenId,
      tx_hash:         data.txHash,
      model_version:   data.modelVersion ?? "TrustCredit v2.1",
      explorer_url:    data.explorerUrl,
    })
    .select()
    .single()

  if (error) throw new Error(`saveScore: ${error.message}`)
  await createNotification(data.walletAddress, "score_updated", "Credit Score Updated",
    `Your new score is ${data.score} (Band ${data.scoreBand})`)
  return row
}

export async function getScoreHistory(walletAddress: string, limit = 10) {
  const { data } = await supabase
    .from("credit_scores")
    .select("*")
    .eq("wallet_address", walletAddress.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function getLatestScore(walletAddress: string) {
  const { data } = await supabase
    .from("credit_scores")
    .select("*")
    .eq("wallet_address", walletAddress.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(1)
    .single()
  return data
}

// ── Audits ────────────────────────────────────────────────────
export async function saveAudit(data: {
  walletAddress:   string
  contractAddress: string
  contractName?:   string
  chain?:          string
  auditId?:        string
  reportCID?:      string
  score?:          number
  txHash?:         string
  explorerUrl?:    string
  status?:         string
}) {
  const { data: row, error } = await supabase
    .from("audits")
    .insert({
      wallet_address:   data.walletAddress.toLowerCase(),
      contract_address: data.contractAddress,
      contract_name:    data.contractName,
      chain:            data.chain ?? "avalanche-fuji",
      audit_id:         data.auditId,
      report_cid:       data.reportCID,
      score:            data.score,
      tx_hash:          data.txHash,
      explorer_url:     data.explorerUrl,
      status:           data.status ?? "complete",
    })
    .select()
    .single()

  if (error) throw new Error(`saveAudit: ${error.message}`)
  await createNotification(data.walletAddress, "audit_complete", "Audit Complete",
    `Audit for ${data.contractName ?? data.contractAddress} scored ${data.score}/100`)
  return row
}

export async function getAuditHistory(walletAddress: string, limit = 20) {
  const { data } = await supabase
    .from("audits")
    .select("*")
    .eq("wallet_address", walletAddress.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(limit)
  return data ?? []
}

// ── Blind Audits ──────────────────────────────────────────────
export async function saveBlindAudit(data: {
  walletAddress:  string
  jobId:          string
  agentId:        string
  contractAddr:   string
  projectName?:   string
  findingsHash?:  string
  attestationCID?: string
  resultCID?:     string
  teeProvider?:   string
  valid?:         boolean
  status?:        string
}) {
  const { data: row, error } = await supabase
    .from("blind_audits")
    .upsert({
      wallet_address:  data.walletAddress.toLowerCase(),
      job_id:          data.jobId,
      agent_id:        data.agentId,
      contract_addr:   data.contractAddr,
      project_name:    data.projectName,
      findings_hash:   data.findingsHash,
      attestation_cid: data.attestationCID,
      result_cid:      data.resultCID,
      tee_provider:    data.teeProvider ?? "Phala Network (Intel SGX)",
      valid:           data.valid,
      status:          data.status ?? "complete",
      completed_at:    new Date().toISOString(),
    }, { onConflict: "job_id" })
    .select()
    .single()

  if (error) throw new Error(`saveBlindAudit: ${error.message}`)
  return row
}

export async function getBlindAuditHistory(walletAddress: string, limit = 20) {
  const { data } = await supabase
    .from("blind_audits")
    .select("*")
    .eq("wallet_address", walletAddress.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(limit)
  return data ?? []
}

// ── Intents ───────────────────────────────────────────────────
export async function saveIntent(data: {
  walletAddress: string
  intentId?:     string
  nlText:        string
  nlHash?:       string
  specJson?:     string
  specHash?:     string
  category:      string
  status?:       string
  resultCID?:    string
  hcsMsgId?:     string
  txHash?:       string
  explorerUrl?:  string
}) {
  const { data: row, error } = await supabase
    .from("intents")
    .upsert({
      wallet_address: data.walletAddress.toLowerCase(),
      intent_id:      data.intentId,
      nl_text:        data.nlText,
      nl_hash:        data.nlHash,
      spec_json:      data.specJson,
      spec_hash:      data.specHash,
      category:       data.category,
      status:         data.status ?? "parsed",
      result_cid:     data.resultCID,
      hcs_msg_id:     data.hcsMsgId,
      tx_hash:        data.txHash,
      explorer_url:   data.explorerUrl,
    }, { onConflict: "intent_id" })
    .select()
    .single()

  if (error) throw new Error(`saveIntent: ${error.message}`)
  return row
}

export async function getIntentHistory(walletAddress: string, limit = 20) {
  const { data } = await supabase
    .from("intents")
    .select("*")
    .eq("wallet_address", walletAddress.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function updateIntentStatus(intentId: string, status: string, extras: object = {}) {
  await supabase
    .from("intents")
    .update({ status, ...extras, executed_at: new Date().toISOString() })
    .eq("intent_id", intentId)
}

// ── Agent NFTs ────────────────────────────────────────────────
export async function saveAgentNFT(data: {
  walletAddress: string
  tokenId:       string
  agentId:       string
  agentName?:    string
  model?:        string
  capabilities?: string[]
  txHash?:       string
  metadataCID?:  string
  explorerUrl?:  string
}) {
  const { data: row, error } = await supabase
    .from("agent_nfts")
    .insert({
      wallet_address: data.walletAddress.toLowerCase(),
      token_id:       data.tokenId,
      agent_id:       data.agentId,
      agent_name:     data.agentName,
      model:          data.model,
      capabilities:   data.capabilities ?? [],
      tx_hash:        data.txHash,
      metadata_cid:   data.metadataCID,
      explorer_url:   data.explorerUrl,
    })
    .select()
    .single()

  if (error) throw new Error(`saveAgentNFT: ${error.message}`)
  await createNotification(data.walletAddress, "agent_minted", "Agent NFT Minted",
    `Agent "${data.agentName}" registered with token #${data.tokenId}`)
  return row
}

export async function getAgentNFTs(walletAddress: string) {
  const { data } = await supabase
    .from("agent_nfts")
    .select("*")
    .eq("wallet_address", walletAddress.toLowerCase())
    .order("minted_at", { ascending: false })
  return data ?? []
}

// ── Notifications ─────────────────────────────────────────────
export async function createNotification(
  walletAddress: string,
  type:          string,
  title:         string,
  message?:      string,
  data:          object = {}
) {
  await supabase.from("notifications").insert({
    wallet_address: walletAddress.toLowerCase(),
    type,
    title,
    message,
    data,
  })
}

export async function getNotifications(walletAddress: string, unreadOnly = false) {
  let q = supabase
    .from("notifications")
    .select("*")
    .eq("wallet_address", walletAddress.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(50)

  if (unreadOnly) q = q.eq("read", false)
  const { data } = await q
  return data ?? []
}

export async function markNotificationsRead(walletAddress: string) {
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("wallet_address", walletAddress.toLowerCase())
    .eq("read", false)
}

// ── Dashboard ─────────────────────────────────────────────────
export async function getDashboard(walletAddress: string) {
  const wallet = walletAddress.toLowerCase()
  const [latestScore, auditCount, intentCount, agentCount, unread] = await Promise.all([
    getLatestScore(wallet),
    supabase.from("audits").select("id", { count: "exact" }).eq("wallet_address", wallet),
    supabase.from("intents").select("id", { count: "exact" }).eq("wallet_address", wallet),
    supabase.from("agent_nfts").select("id", { count: "exact" }).eq("wallet_address", wallet),
    supabase.from("notifications").select("id", { count: "exact" }).eq("wallet_address", wallet).eq("read", false),
  ])

  return {
    latestScore,
    auditCount:   auditCount.count  ?? 0,
    intentCount:  intentCount.count ?? 0,
    agentCount:   agentCount.count  ?? 0,
    unreadCount:  unread.count      ?? 0,
  }
}