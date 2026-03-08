// types.ts — TrustBox CRE Workflow
// This interface must exactly match the shape of config.json.
// The CRE runtime reads config.json and injects it as runtime.config.
// Any field accessed in main.ts via runtime.config.X must exist here AND in config.json.

export interface TrustBoxConfig {
  apiUrl:   string      // TrustBox backend — https://trustbox-backend-kxkr.onrender.com
  gasLimit: number

  contracts: {
    trustRegistry:    string   // 0x... on Avalanche Fuji
    auditRegistry:    string
    intentVault:      string
    agentMarketplace: string
  }

  hedera: {
    topicId: string    // HCS_INTENT_TOPIC_ID  e.g. 0.0.xxxxx
    network: string    // "testnet"
  }
}