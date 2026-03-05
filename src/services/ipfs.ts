/* services/ipfs.ts — TrustBox */

import { PinataSDK } from "pinata"
import { env }       from "../config/env"

const pinata = new PinataSDK({
  pinataJwt:     env.PINATA_JWT,
  pinataGateway: env.PINATA_GATEWAY,
})

export interface IPFSResult {
  cid: string
  url: string
}

// ── Core upload — returns { cid, url } ───────────────────────
export async function uploadJSON(data: object): Promise<IPFSResult> {
  const blob   = new Blob([JSON.stringify(data)], { type: "application/json" })
  const file   = new File([blob], "data.json", { type: "application/json" })
  const result = await pinata.upload.public.file(file)
  return { cid: result.cid, url: `${env.PINATA_GATEWAY}/ipfs/${result.cid}` }
}

export async function uploadText(text: string, filename = "data.txt"): Promise<IPFSResult> {
  const blob   = new Blob([text], { type: "text/plain" })
  const file   = new File([blob], filename, { type: "text/plain" })
  const result = await pinata.upload.public.file(file)
  return { cid: result.cid, url: `${env.PINATA_GATEWAY}/ipfs/${result.cid}` }
}

// ── Core fetch ────────────────────────────────────────────────
export async function fetchJSON(cid: string): Promise<object> {
  const url = `${env.PINATA_GATEWAY}/ipfs/${cid}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`IPFS fetch failed for CID ${cid}: ${res.statusText}`)
  return res.json() as Promise<object>
}

export async function fetchText(cid: string): Promise<string> {
  const url = `${env.PINATA_GATEWAY}/ipfs/${cid}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`IPFS fetch failed for CID ${cid}: ${res.statusText}`)
  return res.text()
}

export function ipfsUrl(cid: string): string {
  return `${env.PINATA_GATEWAY}/ipfs/${cid}`
}

// ── Domain-specific pinning ───────────────────────────────────
export async function pinAgentMetadata(data: {
  agentId:      string
  name:         string
  operator:     string
  model?:       string
  modelHash?:   string
  capabilities?: string[]
  teeEndpoint?:  string
  timestamp?:    string
  [key: string]: unknown
}): Promise<IPFSResult> {
  return uploadJSON({ type: "agent_metadata", ...data })
}

export async function pinAuditReport(data: {
  contractAddress: string
  contractName?:   string
  chain?:          string
  deployer?:       string
  reportHash?:     string
  findings:        object
  score:           number
  auditor?:        string
  timestamp?:      string
  [key: string]: unknown
}): Promise<IPFSResult> {
  return uploadJSON({
    type:      "audit_report",
    reportHash: data.reportHash ?? "",
    timestamp:  data.timestamp  ?? new Date().toISOString(),
    auditor:    data.auditor    ?? "",
    ...data,
  })
}

export async function pinZKReceipt(data: {
  walletAddress?: string
  scoreHash:      string
  scoreBand:      number
  proof:          object
  publicSignals:  string[]
  modelVersion:   string
  timestamp?:     string
  [key: string]: unknown
}): Promise<IPFSResult> {
  return uploadJSON({
    type:         "zk_receipt",
    walletAddress: data.walletAddress ?? "",
    timestamp:     data.timestamp     ?? new Date().toISOString(),
    ...data,
  })
}

export async function pinIntentRecord(data: {
  intentId:   string
  nlHash:     string
  specHash:   string
  specJson?:  string
  category:   string
  submitter?: string
  userSig?:   string
  timestamp?: string
  [key: string]: unknown
}): Promise<IPFSResult> {
  return uploadJSON({
    type:      "intent_record",
    submitter:  data.submitter  ?? "",
    timestamp:  data.timestamp  ?? new Date().toISOString(),
    ...data,
  })
}

export async function pinBlindAuditResult(data: {
  jobId:          string
  contractAddr:   string
  agentId:        string
  findingsHash:   string
  attestationCID: string
  teeSignature?:  string
  timestamp?:     string
  [key: string]: unknown
}): Promise<IPFSResult> {
  return uploadJSON({
    type:        "blind_audit_result",
    teeSignature: data.teeSignature ?? "",
    timestamp:    data.timestamp    ?? new Date().toISOString(),
    ...data,
  })
}