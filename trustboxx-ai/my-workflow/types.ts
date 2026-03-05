export interface TrustBoxConfig {
  chainSelectorName: string
  apiUrl:            string        // ← add this
  gasLimit:          number
  contracts: {
    trustRegistry:    string
    auditRegistry:    string
    intentVault:      string
    agentMarketplace: string
  }
  hedera: {
    topicId: string
    network: string
  }
  schedules: {
    creditScoreRefresh: string
    agentTrustRefresh:  string
  }
  trustScore: {
    minScore:     number
    passingScore: number
  }
}