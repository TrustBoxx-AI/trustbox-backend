# TrustBox AI — Trustworthy AI Agent Infrastructure

> **Verifiable AI agent credentials, human-in-the-loop audits, and ZK credit scoring — anchored on Avalanche and Hedera.**

## What is TrustBox?

TrustBox is a decentralised trust infrastructure for AI agents. As AI agents become more autonomous — executing DeFi trades, managing wallets, auditing contracts — there is no standard way to verify what model they run, who operates them, or whether their outputs have been reviewed by a human.

TrustBox solves this with six verifiable trust workflows, each cryptographically anchored across Avalanche and Hedera.

---

## Live Deployments

| Service | URL |
|---|---|
| Frontend | https://trustbox-ai.vercel.app |
| Backend API | https://trustbox-backend-kxkr.onrender.com |
| Health Check | https://trustbox-backend-kxkr.onrender.com/health |

---

## Smart Contracts — Avalanche Fuji (chainId: 43113)

| Contract | Address | Purpose |
|---|---|---|
| TrustRegistry | `0x8A24ea199EAAbc8AAcb7cb92660FD20a2BA2552A` | ERC-8004 AI agent credential NFTs |
| AuditRegistry | `0x62e2Ba19a38AcA58B829aEC3ED8Db9bfd89D5Fd3` | HITL audit anchoring + Merkle proofs |
| AgentMarketplace | `0x12d7ef9627d0F4c6C6e0EB85A4D6388cee5d91c2` | Agent staking + TEE job dispatch |
| IntentVault | `0xB9aE50f6989574504e6CA465283BaD9570944B67` | NL intent storage + signature verification |

---

## Hedera Infrastructure

| Resource | ID |
|---|---|
| Operator Account | `0.0.8064612` |
| HCS-10 Inbox Topic | `0.0.8127186` |
| HCS-10 Outbox Topic | `0.0.8127187` |
| Credit Credential Token | TBCC (HTS NFT) |

---

## The Six Workflows

### 1. ZK Credit Score
Raw score never leaves the browser. `snarkjs` generates a Groth16 proof the score falls within a band (Poor/Fair/Good/Excellent). Backend verifies, pins ZK receipt to IPFS, submits HCS message to Hedera, mints TBCC HTS NFT.

**Chains:** Hedera HCS + HTS

### 2. Smart Contract Audit (Human-in-the-Loop)
**Phase 1:** Groq Llama 3.1 70B analyses the contract — structured findings with severity, title, detail, line, remediation. Merkle tree computed. Nothing on-chain yet.

**Phase 2:** Auditor reviews, signs `reportHash` via MetaMask (proves human review). `AuditRegistry.submitAudit()` called with signature + Merkle root + IPFS CID. HCS trail written to Hedera.

**Chains:** Avalanche Fuji + Hedera HCS + IPFS

### 3. Blind TEE Audit
Code analysed inside Phala Network SGX enclave. Even TrustBox cannot see the raw source. Attestation quote verified and pinned to IPFS.

**Chains:** Phala TEE + Avalanche

### 4. Execute Intent (NL → On-Chain)
User types natural language. Groq parses to structured JSON spec. User signs `specHash` — not raw text — blocking prompt injection. Submitted to `IntentVault.sol`. Chainlink Automation triggers execution. HCS trail written.

**Chains:** Avalanche + Hedera HCS + Chainlink Automation

### 5. Verify AI Agent (ERC-8004)
ERC-8004 credential NFT minted on `TrustRegistry.sol` binding agent ID, model hash, capability hash, operator address, and IPFS metadata CID. On-chain proof of what model the agent runs.

**Chains:** Avalanche TrustRegistry

### 6. Security Agent Scan
Behavioural analysis across five categories. Agent registered on `AgentMarketplace.sol` with AVAX stake before marketplace listing.

**Chains:** Avalanche AgentMarketplace

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Frontend (Vercel)                   │
│           React 18 + TypeScript + MetaMask           │
└──────────────────────┬───────────────────────────────┘
                       │ HTTPS / REST
┌──────────────────────▼───────────────────────────────┐
│                 Backend (Render)                     │
│               Express + TypeScript                   │
│                                                      │
│  /api/auth       EIP-191 wallet auth → JWT           │
│  /api/score      ZK proof verify + Hedera HCS        │
│  /api/audit      HITL audit + AuditRegistry.sol      │
│  /api/verify     ERC-8004 mint + TrustRegistry.sol   │
│  /api/intent     NL parse + IntentVault.sol          │
│  /api/scan       Behavioural + AgentMarketplace.sol  │
│  /api/blindaudit Phala TEE blind audit               │
│  /api/history    Activity log (in-memory / Supabase) │
└──────┬────────┬────────┬────────┬────────┬───────────┘
       │        │        │        │        │
   Avalanche  Hedera   Groq    Pinata   Phala
   Fuji RPC   HCS/HTS  API     IPFS     TEE
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Backend | Node.js, Express, TypeScript |
| Blockchain | Solidity 0.8.20, ethers.js v6 |
| AI Engine | Groq API — Llama 3.1 70B |
| ZK Proofs | snarkjs — Groth16 / BN128 |
| Storage | IPFS via Pinata |
| Hedera | @hashgraph/sdk — HCS + HTS |
| TEE | Phala Network |
| Automation | Chainlink Automation |
| Auth | EIP-191 signatures + JWT |
| Hosting | Vercel (frontend) + Render (backend) |

---

## Running Locally

### Prerequisites
- Node.js 18+
- MetaMask with Avalanche Fuji (chainId: 43113, RPC: `https://api.avax-test.network/ext/bc/C/rpc`)
- Test AVAX from https://faucet.avax.network

### Backend
```bash
cd trustbox-backend
npm install
cp .env.example .env   # Fill in required vars below
npm run dev            # Starts on port 4000
```

### Frontend
```bash
cd trustbox-frontend
npm install
npm run dev            # Opens http://localhost:5173
```

### Required Environment Variables
```env
AVALANCHE_FUJI_RPC=https://api.avax-test.network/ext/bc/C/rpc
DEPLOYER_PRIVATE_KEY=0x...
JWT_SECRET=min-16-chars
GROQ_API_KEY=gsk_...

TRUST_REGISTRY_ADDR=0x8A24ea199EAAbc8AAcb7cb92660FD20a2BA2552A
AUDIT_REGISTRY_ADDR=0x62e2Ba19a38AcA58B829aEC3ED8Db9bfd89D5Fd3
AGENT_MARKETPLACE_ADDR=0x12d7ef9627d0F4c6C6e0EB85A4D6388cee5d91c2
INTENT_VAULT_ADDR=0xB9aE50f6989574504e6CA465283BaD9570944B67

# Optional — falls back to demo/stub mode if not set
HEDERA_OPERATOR_ID=0.0.8064612
HEDERA_OPERATOR_KEY=your-ecdsa-hex-key
PINATA_JWT=your-pinata-jwt
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
```

---

## Setup Scripts

```bash
# Run with:
npx ts-node --transpile-only scripts/utils/<script>.ts

# Available scripts:
scripts/utils/createHcsTopics.ts       # Create 4 HCS topics on Hedera
scripts/utils/createHtsToken.ts        # Create TBCC HTS NFT collection
scripts/utils/addAuditor.ts            # Authorise backend signer on AuditRegistry
scripts/utils/registerHOLAgent.ts      # Register on HOL Agent Registry
scripts/utils/generateZkArtifacts.ts  # Generate ZK artifacts (Windows-compatible)
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Wallet signature → JWT |
| GET | `/api/auth/me` | Current user + dashboard stats |
| POST | `/api/audit/prepare` | Phase 1: AI analysis → findings (no chain write) |
| POST | `/api/audit` | Phase 2: anchor HITL-approved audit on-chain |
| POST | `/api/intent/parse` | NL text → structured JSON spec |
| POST | `/api/intent/submit` | Signed spec → IntentVault + HCS |
| POST | `/api/verify/prepare` | Compute agent hashes + pin metadata |
| POST | `/api/verify/mint` | Mint ERC-8004 credential NFT |
| POST | `/api/score` | Verify ZK proof + Hedera HCS + HTS mint |
| POST | `/api/scan` | Behavioural scan + AgentMarketplace registration |
| POST | `/api/blindaudit` | Phala TEE blind audit |
| GET | `/api/history/dashboard` | Activity summary |
| GET | `/api/history/audits` | Audit history |
| GET | `/api/history/intents` | Intent history |
| GET | `/api/history/agents` | Agent NFT history |
| GET | `/health` | Server health check |

---

## Security Design

- **EIP-191 signatures** on all state-changing endpoints — backend verifies recovered address matches sender
- **HITL enforcement** — `auditorSig` stored on-chain, proving a human reviewed AI findings before anchoring
- **Spec hash signing** — users sign `specHash` not raw NL text, blocking prompt injection attacks
- **Merkle proof of findings** — post-approval tampering is cryptographically detectable
- **ZK privacy** — raw credit score never transmitted, only band membership proven via Groth16
- **JWT auth** — 7-day TTL, wallet-bound, stateless — no session storage
- **Rate limiting** — all API routes via express-rate-limit

---

## Hackathon Track Alignment

**Avalanche** — 4 contracts deployed on Fuji. TrustRegistry implements the emerging ERC-8004 AI agent credential standard. All transactions verifiable on Snowtrace.

**Hedera** — HCS topics for immutable audit trails. HCS-10 standard compliance with inbox/outbox topics. TBCC HTS NFT for ZK credit credentials. Every action produces a HashScan-verifiable sequence number.

**Chainlink** — Automation integrated in IntentVault for automated execution triggers. Architecture ready for VRF-based agent selection.

**Groq / AI** — Llama 3.1 70B used for contract security analysis (4–6 structured findings with severity + remediation) and NL intent parsing. HITL pattern ensures AI outputs are human-approved before on-chain anchoring.

---

## License

MIT — Built for the hackathon, March 2026.

---

*TrustBox AI — Making AI agents trustworthy, verifiable, and accountable.*
*Built on Avalanche | Secured by Hedera | Automated by Chainlink | Powered by Groq*

---

## Chainlink Integration

### Backend — files that use Chainlink

| File | Chainlink feature | Link |
|---|---|---|
| `src/services/chainlink.ts` | **Core integration** — Chainlink Functions (`parseIntent` via DON), Price Feeds (AVAX/USD, ETH/USD, BTC/USD via `latestRoundData()`), SecretsManager for DON-hosted encrypted secrets | [view](https://github.com/trustboxx-ai/trustbox-backend/src/services/chainlink.ts) |
| `src/api/execute.ts` | Imports `parseIntent` from chainlink.ts — `POST /api/intent/parse` triggers a Chainlink Functions request; `POST /api/intent/submit` registers an Automation upkeep and awaits the `performUpkeep()` callback | [view](https://github.com/trustboxx-ai/trustbox-backend/src/api/execute.ts) |
| `src/config/env.ts` | Declares all Chainlink env vars — `CHAINLINK_SUBSCRIPTION_ID`, `CHAINLINK_DON_ID`, `CHAINLINK_ROUTER`, `CHAINLINK_LINK_TOKEN`, `CHAINLINK_AUTOMATION_REGISTRY`, `CHAINLINK_UPKEEP_ID`, `CHAINLINK_SECRETS_VERSION` | [view](https://github.com/trustboxx-ai/trustbox-backend/src/config/env.ts) |
| `src/index.ts` | Exports the `CHAINLINK` config object (router address, DON ID, price feed addresses, subscription ID, upkeep ID) used across services | [view](https://github.com/trustboxx-ai/trustbox-backend/src/index.ts) |

### Frontend — files that use Chainlink

| File | Chainlink feature | Link |
|---|---|---|
| `src/constants.ts` | Execute Intent entity config — sets `badge: "Chainlink"`, `chain: "Chainlink"`, and includes Chainlink in the chain pill display for the intent workflow | [view](https://github.com/trustboxx-ai/trustbox-frontend/src/constants.ts) |
| `src/components/Dashboard.tsx` | Renders `ChainPill` with Chainlink label and colour (`#375BD2`) in the Execute Intent results drawer | [view](https://github.com/trustboxx-ai/trustbox-frontend/src/components/Dashboard.tsx) |
| `src/components/Landing.tsx` | Landing page describes Chainlink Automation + Price Feeds in the intent execution feature card; displays Chainlink logo badge | [view](https://github.com/trustboxx-ai/trustbox-frontend/src/components/Landing.tsx) |

### Smart Contract — Chainlink Automation

| File | Chainlink feature | Link |
|---|---|---|
| `contracts/IntentVault.sol` | Implements `AutomationCompatibleInterface` — `checkUpkeep()` polls for pending intents, `performUpkeep()` executes approved intent specs | [view](https://github.com/trustboxx-ai/trustbox-backend/contracts/evm/src/IntentVault.sol) |

### What each Chainlink product does in TrustBox

**Chainlink Functions** (`chainlink.ts`, `execute.ts`)
Natural language intent text is sent to a Chainlink Functions request on the Avalanche Fuji DON. A JavaScript source file (`functions/source/parseIntent.js`) running inside the DON calls the Groq API and returns a structured JSON spec. The result is fulfilled back to `FunctionsConsumer.sol` via the `IntentParsed` event, which the backend listens for with a 90-second timeout.

**Chainlink Automation** (`execute.ts`, `IntentVault.sol`)
After an intent spec is submitted to `IntentVault.sol`, Chainlink Automation monitors `checkUpkeep()`. When a pending intent is found, `performUpkeep()` is called to execute it on-chain. The backend registers and funds an upkeep via the Automation Registry (`0x819B58A646CDd8289275A87653a2aA4902b14fe6` on Fuji).

**Chainlink Price Feeds** (`chainlink.ts`)
`getAvaxUsdPrice()`, `getEthUsdPrice()`, and `getBtcUsdPrice()` read from Fuji Price Feed contracts via `latestRoundData()`. Answers are validated for staleness (>1 hour) and zero/negative values before use.

---

## Chainlink Runtime Environment (CRE) & Tenderly Virtual TestNet
### Tenderly Virtual TestNet — Explorer Link

TrustBox smart contracts are deployed and verified on a Tenderly Virtual TestNet forked from Avalanche Fuji. The Virtual TestNet provides a full transaction history for every CRE workflow execution.

**🔗 Tenderly Virtual TestNet Explorer:**
```
(https://dashboard.tenderly.co/davife2025/project/testnet/ab1adedd-dc7f-4773-b54d-aba302add10d)
```

> **To generate your Tenderly explorer link:**
> 1. Log in at https://dashboard.tenderly.co
> 2. Create a new Virtual TestNet → Fork → Avalanche Fuji (chainId: 43113)
> 3. Deploy contracts using `npm run deploy:tenderly` (see below)
> 4. Your explorer URL will be: `https://dashboard.tenderly.co/<username>/<project>/testnet/<vnet-id>`
> 5. Replace the placeholder above with your real URL before submission

**What the Tenderly explorer shows:**
- All four TrustRegistry, AuditRegistry, AgentMarketplace, IntentVault contract deployments
- Every `submitAudit()`, `mintCredential()`, `submitIntent()`, `registerAgent()` call
- Chainlink Automation `performUpkeep()` execution on IntentVault
- Internal transactions from Chainlink Functions fulfillment callbacks
- Full decoded event logs: `IntentParsed`, `IntentSubmitted`, `IntentExecuted`, `AgentRegistered`, `CredentialMinted`

---

### Deploying to Tenderly Virtual TestNet

```bash
# 1. Install Tenderly CLI
npm install -g @tenderly/cli

# 2. Log in
tenderly login

# 3. Create Virtual TestNet (fork Fuji)
tenderly virtual-testnet create \
  --project trustbox-ai \
  --network 43113 \
  --block-number latest \
  --name "TrustBox CRE Demo"

# 4. Export the RPC URL and chain ID from Tenderly dashboard
# Then add to .env:
TENDERLY_RPC_URL=https://virtual.avalanche.rpc.tenderly.co/YOUR_VNET_ID
TENDERLY_CHAIN_ID=43113

# 5. Deploy all contracts to the Virtual TestNet
npx hardhat run scripts/deploy/deployAll.ts --network tenderly
```

Add to `hardhat.config.ts`:
```typescript
networks: {
  tenderly: {
    url:     process.env.TENDERLY_RPC_URL!,
    chainId: 43113,
    accounts: [process.env.DEPLOYER_PRIVATE_KEY!],
  },
}
```

---

### CRE Workflow — Source Files

The Chainlink Runtime Environment (CRE) orchestrates TrustBox's intent execution workflow. All CRE source files are in the repository root:

| File | Purpose | Link |
|---|---|---|
| [`workflow.yaml`](https://github.com/trustbox-ai/trustbox-backend/trustboxx-ai/workflow.yaml) | CRE workflow definition — names the workflow `trustboxx-ai`, points to `main.ts` entry point and `config.json` | [view](https://github.com/trustbox-ai/trustbox-backend/trustboxx-ai/workflow.yaml) |
| [`project.yaml`](https://github.com/trustbox-ai/trustbox-backend/trust-boxx-ai/my-workflow/project.yaml) | CRE project settings — defines staging and production RPC targets (Sepolia + Avalanche Fuji) | [view](https://github.com/YOUR_ORG/trustbox-backend/trustboxx-ai/my-workflow/project.yaml) |
| [`config.json`](https://github.com/trustbox-ai/trustbox-backend/trustboxx-ai/my-workflow/config.json) | CRE runtime config — chain selector `avalanche-testnet-fuji`, gas limit 500,000, all contract addresses, Hedera topic ID, trust score thresholds | [view](https://github.com/YOUR_ORG/trustbox-backend/trustboxx-ai/my-workflow/config.json) |
| [`secrets.yaml`](https://github.com/trustbox-ai/trustbox-backend/trustboxx-ai/my-workflow/secrets.yaml) | CRE secrets manifest — maps secret names to DON-encrypted values | [view](https://github.com/YOUR_ORG/trustbox-backend/trustboxx-ai/my-workflow/secrets.yaml) |
| [`_env`](https://github.com/YOUR_ORG/trustbox-backend/_env) | CRE environment template — `CRE_ETH_PRIVATE_KEY` and `CRE_TARGET` (staging or production) | [view](https://github.com/YOUR_ORG/trustbox-backend/_env) |
| [`src/services/chainlink.ts`](https://github.com/trustbox-ai/trustbox-backend/src/services/chainlink.ts) | CRE execution layer — Chainlink Functions `parseIntent()`, DON-hosted secrets via `SecretsManager`, Price Feed reads | [view](https://github.com/trustbox-ai/trustbox-backend/src/services/chainlink.ts) |
| [`src/api/execute.ts`](https://github.com/trustbox-ai/trustbox-backend/src/api/execute.ts) | Intent workflow API — calls `parseIntent` (Functions), writes to `IntentVault.sol`, awaits Automation `performUpkeep()` callback | [view](https://github.com/trustbox-ai/trustbox-backend/src/api/execute.ts) |
| [`src/config/chains.ts`](https://github.com/YOUR_ORG/trustbox-backend/blob/main/src/config/chains.ts) | Chainlink addresses — Functions router `0xA9d587a...`, Automation registry `0x819B58A...`, AVAX/USD, ETH/USD, BTC/USD price feed addresses | [view](https://github.com/trustbox-ai/trustbox-backend/src/config/chains.ts) |

---

### CRE Workflow — How It Works

The TrustBox CRE workflow (`trustboxx-ai`) handles the **Execute Intent** pipeline: taking a user's natural language instruction all the way to a verified on-chain execution, with Chainlink orchestrating every step.

```
User types NL intent
        │
        ▼
POST /api/intent/parse
        │
        ▼
chainlink.ts → SecretsManager.buildDONHostedEncryptedSecretsReference()
        │          Encrypts Groq API key reference for DON
        ▼
FunctionsConsumer.sendParseRequest()
        │          Sends parseIntent.js source + args to Chainlink DON
        ▼
DON executes parseIntent.js
        │          Calls Groq Llama 3.1 70B → returns structured JSON spec
        ▼
FunctionsConsumer.fulfillRequest() callback
        │          Fires IntentParsed(requestId, specJson) event
        ▼
Backend receives specJson → computes specHash
        │
        ▼
Frontend displays spec for user review
        │
        ▼
User signs specHash via MetaMask (not raw NL text)
        │
        ▼
POST /api/intent/submit
        │
        ▼
IntentVault.submitIntent(nlHash, specHash, category, userSig)
        │          Writes intent on Avalanche Fuji / Tenderly VNet
        ▼
IntentVault.approveIntent(intentId)
        │
        ▼
Chainlink Automation polls checkUpkeep()
        │          Detects APPROVED intent
        ▼
Automation calls performUpkeep()
        │          IntentExecuted(intentId, executionHash) event fires
        ▼
Backend receives event → pins record to IPFS → writes HCS trail to Hedera
        │
        ▼
Response: avaxTxHash + executionHash + hcsSeqNum + recordCID
```

---

### CRE Configuration

**`workflow.yaml`** — defines the workflow name and artifact paths used by `cre-cli deploy`:
```yaml
staging-settings:
  user-workflow:
    workflow-name: "trustboxx-ai"
  workflow-artifacts:
    workflow-path: "./main.ts"
    config-path:   "./config.json"
    secrets-path:  ""

production-settings:
  user-workflow:
    workflow-name: "trustboxx-ai"
  workflow-artifacts:
    workflow-path: "./main.ts"
    config-path:   "./config.json"
    secrets-path:  "./secrets.yaml"
```

**`config.json`** — runtime parameters read by the CRE workflow at execution time:
```json
{
  "chainSelectorName": "avalanche-testnet-fuji",
  "gasLimit": 500000,
  "contracts": {
    "trustRegistry":    "0x8A24ea199EAAbc8AAcb7cb92660FD20a2BA2552A",
    "auditRegistry":    "0x62e2Ba19a38AcA58B829aEC3ED8Db9bfd89D5Fd3",
    "intentVault":      "0xB9aE50f6989574504e6CA465283BaD9570944B67",
    "agentMarketplace": "0x12d7ef9627d0F4c6C6e0EB85A4D6388cee5d91c2"
  },
  "schedules": {
    "creditScoreRefresh": "0 */6 * * *",
    "agentTrustRefresh":  "0 */2 * * *"
  }
}
```

**`project.yaml`** — RPC endpoints for each CRE target environment:
```yaml
staging-settings:
  rpcs:
    - chain-name: ethereum-testnet-sepolia
      url: https://ethereum-sepolia-rpc.publicnode.com

production-settings:
  rpcs:
    - chain-name: ethereum-testnet-sepolia
      url: https://ethereum-sepolia-rpc.publicnode.com
    - chain-name: ethereum-mainnet
      url: https://ethereum-rpc.publicnode.com
```

---

### Running the CRE Workflow Locally

```bash
# 1. Install CRE CLI
npm install -g @chainlink/cre-cli
# or with bun:
bun install

# 2. Set environment
cp _env .env
# Fill in: CRE_ETH_PRIVATE_KEY, CRE_TARGET=staging-settings

# 3. Simulate workflow locally against Tenderly Virtual TestNet
cre-cli workflow simulate \
  --workflow-path ./main.ts \
  --config-path ./config.json \
  --target staging-settings

# 4. Deploy to DON (requires CHAINLINK_SUBSCRIPTION_ID)
cre-cli workflow deploy \
  --config workflow.yaml \
  --target staging-settings
```

---

### How CRE + Tenderly Virtual TestNets Solve the Problem

**The problem:** Testing AI agent workflows that write on-chain is expensive and slow on public testnets. Gas prices spike, faucets run dry, and a single failed test wastes real AVAX. More critically, Chainlink Automation callbacks are non-deterministic on live testnets — you cannot control exactly when `performUpkeep()` fires, making it impossible to write reliable integration tests.

**How CRE solves it:** The Chainlink Runtime Environment provides a DON-level execution layer that decouples the AI computation (Groq via Functions) from the on-chain write (IntentVault). The DON runs `parseIntent.js` in a deterministic, trust-minimised environment — multiple nodes must agree on the response before it reaches the chain. This means the specJson the user sees and signs is the same one that gets written on-chain, with no possibility of substitution.

**How Tenderly Virtual TestNets solve it:** Virtual TestNets provide a fully forked Avalanche Fuji environment where:
- Contract deployments are instant (no block wait)
- Gas is unlimited for testing — no faucet needed
- Every transaction is captured and decoded in the Tenderly explorer
- State can be reset between test runs
- Chainlink Automation can be simulated by calling `performUpkeep()` directly
- Price feed contracts are forked live, so `latestRoundData()` returns real Fuji prices

Together, CRE + Tenderly Virtual TestNets allow the full TrustBox intent workflow — from NL input through DON consensus through IntentVault to Automation execution — to be tested end-to-end in a controlled environment before deploying to public Fuji.

---

### CRE Workflow Environment Variables

Add to `.env` (copy from `_env`):

```env
# CRE required
CRE_ETH_PRIVATE_KEY=0x...         # Wallet that owns the CRE workflow
CRE_TARGET=staging-settings       # Target from project.yaml

# Chainlink Functions (CRE)
CHAINLINK_SUBSCRIPTION_ID=123
CHAINLINK_DON_ID=fun-avalanche-fuji-1
CHAINLINK_ROUTER=0xA9d587a00A31A52Ed70D6026794a8FC5E2F5dCb0
CHAINLINK_LINK_TOKEN=0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846
CHAINLINK_SECRETS_VERSION=1

# Chainlink Automation
CHAINLINK_AUTOMATION_REGISTRY=0x819B58A646CDd8289275A87653a2aA4902b14fe6
CHAINLINK_UPKEEP_ID=your-upkeep-id

# Tenderly Virtual TestNet (for local testing)
TENDERLY_RPC_URL=https://virtual.avalanche.rpc.tenderly.co/YOUR_VNET_ID
```
