/* data/seedAgents.ts — TrustBox Backend
   Seed agent data — used pre-Session 5 before AgentMarketplace.sol is deployed.
   Mirrors frontend src/constants/agents.js SEED_AGENTS exactly.
   ─────────────────────────────────────────────────────── */

import type { Agent } from "../types/index";

export const SEED_AGENTS: Agent[] = [
  {
    id:           "agt_sec_001",
    name:         "ShieldScan Pro",
    operator:     "Nexus Security Labs",
    version:      "v2.4.1",
    teeProvider:  "Phala Network (Intel SGX)",
    capabilities: ["static-analysis","dependency-audit","secret-detection","reentrancy"],
    languages:    ["Solidity","Python","JavaScript","Rust","Go"],
    auditCount:   1847,
    avgScore:     91,
    stake:        "500 AVAX",
    responseTime: "~45s",
    encPubKey:    "0x04a3b2c1d5e6f7a8b9c0d1e2f3a4b5c6", // placeholder until Session 10
    teeEndpoint:  process.env.PHALA_ENDPOINT
                    ? `${process.env.PHALA_ENDPOINT}agt_sec_001`
                    : "https://phat.phala.network/contracts/0xabc123",
    status:       "online",
    badge:        "Verified TEE",
  },
  {
    id:           "agt_sec_002",
    name:         "VaultAudit",
    operator:     "ChainGuard Protocol",
    version:      "v1.9.0",
    teeProvider:  "Phala Network (Intel SGX)",
    capabilities: ["static-analysis","formal-verification","gas-optimisation","access-control"],
    languages:    ["Solidity","Vyper","Move"],
    auditCount:   934,
    avgScore:     88,
    stake:        "300 AVAX",
    responseTime: "~60s",
    encPubKey:    "0x04d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9",
    teeEndpoint:  process.env.PHALA_ENDPOINT
                    ? `${process.env.PHALA_ENDPOINT}agt_sec_002`
                    : "https://phat.phala.network/contracts/0xdef456",
    status:       "online",
    badge:        "Verified TEE",
  },
  {
    id:           "agt_sec_003",
    name:         "ZeroTrace",
    operator:     "Stealth Audit DAO",
    version:      "v3.1.2",
    teeProvider:  "Phala Network (Intel SGX)",
    capabilities: ["secret-detection","ip-theft-prevention","licence-compliance","obfuscation-check"],
    languages:    ["JavaScript","TypeScript","Python","Java","C++"],
    auditCount:   412,
    avgScore:     94,
    stake:        "750 AVAX",
    responseTime: "~30s",
    encPubKey:    "0x04a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5",
    teeEndpoint:  process.env.PHALA_ENDPOINT
                    ? `${process.env.PHALA_ENDPOINT}agt_sec_003`
                    : "https://phat.phala.network/contracts/0xghi789",
    status:       "online",
    badge:        "Top Rated",
  },
  {
    id:           "agt_sec_004",
    name:         "DeepSec AI",
    operator:     "Autonomous Audit Inc.",
    version:      "v1.2.0",
    teeProvider:  "Phala Network (Intel SGX)",
    capabilities: ["ai-vulnerability-detection","pattern-matching","behaviour-analysis"],
    languages:    ["Python","Rust","Go","Solidity"],
    auditCount:   267,
    avgScore:     86,
    stake:        "200 AVAX",
    responseTime: "~90s",
    encPubKey:    "0x04f8e9d0c1b2a3b4c5d6e7f8a9b0c1d2",
    teeEndpoint:  process.env.PHALA_ENDPOINT
                    ? `${process.env.PHALA_ENDPOINT}agt_sec_004`
                    : "https://phat.phala.network/contracts/0xjkl012",
    status:       "busy",
    badge:        "AI-Powered",
  },
  {
    id:           "agt_sec_005",
    name:         "PrivacyGuard",
    operator:     "Zero-Knowledge Labs",
    version:      "v2.0.1",
    teeProvider:  "Phala Network (Intel SGX)",
    capabilities: ["privacy-analysis","data-leak-detection","gdpr-compliance","zk-readiness"],
    languages:    ["Circom","Noir","JavaScript","Python"],
    auditCount:   183,
    avgScore:     97,
    stake:        "1000 AVAX",
    responseTime: "~120s",
    encPubKey:    "0x04c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7",
    teeEndpoint:  process.env.PHALA_ENDPOINT
                    ? `${process.env.PHALA_ENDPOINT}agt_sec_005`
                    : "https://phat.phala.network/contracts/0xmno345",
    status:       "online",
    badge:        "ZK Specialist",
  },
];
