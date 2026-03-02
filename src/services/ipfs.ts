/* services/ipfs.ts — TrustBox
   Pinata SDK wrapper for all IPFS pinning operations.
   Every proof, report, metadata, and attestation goes through here.
   ──────────────────────────────────────────────────────────────── */

import { PinataSDK } from "pinata";
import { env }   from "../config/env";

let _pinata: InstanceType<typeof PinataSDK> | null = null;

function getPinata() {
  if (!env.PINATA_JWT) {
    throw new Error("PINATA_JWT not set — add to .env (Session 7)");
  }
  if (!_pinata) {
   _pinata = new PinataSDK({ pinataJwt: env.PINATA_JWT, pinataGateway: env.PINATA_GATEWAY });
  }
  return _pinata;
}

// ── Upload JSON ───────────────────────────────────────────────
export async function pinJSON(
  data: object,
  name: string
): Promise<{ cid: string; url: string }> {
  const pinata = getPinata();
  const result = await pinata.pinning.pinJSONToIPFS(data, {
    pinataMetadata: {
      name: `trustbox-${name}-${Date.now()}`,
    },
  });

  return {
    cid: result.IpfsHash,
    url: `${env.PINATA_GATEWAY}/ipfs/${result.IpfsHash}`,
  };
}

// ── Upload file buffer (for encrypted code bundles) ──────────
export async function pinBuffer(
  buffer: Buffer,
  filename: string,
  contentType = "application/octet-stream"
): Promise<{ cid: string; url: string }> {
  const pinata = getPinata();

  const { Readable } = await import("stream");
  const stream = Readable.from(buffer);
  (stream as any).path = filename;

  const result = await pinata.pinning.pinFileToIPFS(stream, {
    pinataMetadata: { name: `trustbox-${filename}-${Date.now()}` },
    pinataOptions:  { cidVersion: 1 },
  });

  return {
    cid: result.IpfsHash,
    url: `${env.PINATA_GATEWAY}/ipfs/${result.IpfsHash}`,
  };
}

// ── Fetch pinned JSON ─────────────────────────────────────────
export async function fetchJSON(cid: string): Promise<object> {
  const url = `${env.PINATA_GATEWAY}/ipfs/${cid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IPFS fetch failed for CID ${cid}: ${res.statusText}`);
  return res.json();
}

// ── Typed upload helpers for each proof type ─────────────────

export async function pinAgentMetadata(data: {
  agentId:      string;
  name:         string;
  model:        string;
  operator:     string;
  capabilities: string[];
  environment:  string;
  modelHash:    string;
  trustScore:   number;
  mintedAt:     string;
}) {
  return pinJSON(data, `agent-metadata-${data.agentId}`);
}

export async function pinAuditReport(data: {
  contractAddress: string;
  contractName:    string;
  chain:           string;
  findings:        object[];
  score:           number;
  merkleRoot:      string;
  methodology:     string;
  auditor:         string;
  auditedAt:       string;
}) {
  return pinJSON(data, `audit-report-${data.contractAddress.slice(0, 8)}`);
}

export async function pinZKReceipt(data: {
  proof:          object;
  publicSignals:  string[];
  scoreHash:      string;
  scoreBand:      number;
  modelVersion:   string;
  timestamp:      string;
}) {
  return pinJSON(data, `zk-receipt`);
}

export async function pinTEEAttestation(data: {
  jobId:           string;
  agentId:         string;
  findingsHash:    string;
  attestationQuote:string;
  teeProvider:     string;
  timestamp:       string;
}) {
  return pinJSON(data, `tee-attestation-${data.jobId}`);
}

export async function pinIntentRecord(data: {
  intentId:      string;
  nlHash:        string;
  specHash:      string;
  userSig:       string;
  executionHash: string;
  category:      string;
  timestamp:     string;
}) {
  return pinJSON(data, `intent-record-${data.intentId}`);
}
