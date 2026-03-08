import { HardhatUserConfig } from "hardhat/config"
import "@nomicfoundation/hardhat-toolbox"
import "@nomicfoundation/hardhat-ethers"
import * as dotenv from "dotenv"
dotenv.config()

const DEPLOYER_KEY  = process.env.DEPLOYER_PRIVATE_KEY  ?? "0x" + "0".repeat(64)
const FUJI_RPC      = process.env.AVALANCHE_FUJI_RPC    ?? "https://api.avax-test.network/ext/bc/C/rpc"

// ── Tenderly Virtual TestNet ──────────────────────────────────
// One VTN forked from Avalanche C-Chain mainnet (chain ID 43114)
// giving us real Chainlink price feed state and real DeFi protocol state.
//
// Create your VTN at: https://dashboard.tenderly.co/virtual-testnets
// Copy the Admin RPC URL → TENDERLY_ADMIN_RPC
// Copy the Public RPC URL → TENDERLY_RPC
// Copy the Explorer URL  → TENDERLY_EXPLORER_URL  (for submission)
//
// Two VTN flavours we use:
//   tenderly-avax   — fork of Avalanche C-Chain mainnet (primary)
//   tenderly-eth    — fork of Ethereum mainnet (for cross-chain workflow 4)
const TENDERLY_AVAX_RPC   = process.env.TENDERLY_AVAX_RPC   ?? ""
const TENDERLY_ETH_RPC    = process.env.TENDERLY_ETH_RPC    ?? ""
const TENDERLY_ADMIN_RPC  = process.env.TENDERLY_ADMIN_RPC  ?? TENDERLY_AVAX_RPC

const config: HardhatUserConfig = {
  solidity: {
    // Two compilers: contracts use exact 0.8.24, OZ v5 needs cancun evmVersion for mcopy.
    // evmVersion "cancun" is supported by both 0.8.24 and 0.8.28.
    compilers: [
      {
        version: "0.8.24",
        settings: {
          optimizer:  { enabled: true, runs: 200 },
          viaIR:      true,
          evmVersion: "cancun",   // enables mcopy opcode — required by OZ v5 Bytes.sol
        },
      },
      {
        version: "0.8.28",
        settings: {
          optimizer:  { enabled: true, runs: 200 },
          viaIR:      true,
          evmVersion: "cancun",
        },
      },
    ],
  },

  networks: {
    // ── Avalanche Fuji (existing testnet) ─────────────────────
    fuji: {
      url:      FUJI_RPC,
      chainId:  43113,
      accounts: [DEPLOYER_KEY],
      gasPrice: 30_000_000_000,   // 30 gwei
    },

    // ── Tenderly Virtual TestNet — Avalanche C-Chain fork ─────
    // Forked from Avalanche mainnet (43114). Real price feeds,
    // real DeFi state, unlimited faucet.
    // Create at: https://dashboard.tenderly.co/virtual-testnets
    "tenderly-avax": {
      url:      TENDERLY_AVAX_RPC,
      chainId:  process.env.TENDERLY_AVAX_CHAIN_ID
                  ? parseInt(process.env.TENDERLY_AVAX_CHAIN_ID)
                  : 43114,
      accounts: [DEPLOYER_KEY],
    },

    // ── Tenderly Virtual TestNet — Ethereum mainnet fork ──────
    // Used by Workflow 4 (cross-chain price verification).
    // Forked from Ethereum mainnet (1). Real Chainlink ETH/USD
    // feed at 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419.
    "tenderly-eth": {
      url:      TENDERLY_ETH_RPC,
      chainId:  process.env.TENDERLY_ETH_CHAIN_ID
                  ? parseInt(process.env.TENDERLY_ETH_CHAIN_ID)
                  : 1,
      accounts: [DEPLOYER_KEY],
    },
  },

  // ── Tenderly plugin config (optional — for Tenderly dashboard push) ──
  // Install: npm install --save-dev @tenderly/hardhat-tenderly
  // Docs:    https://docs.tenderly.co/contract-verification
  // tenderly: {
  //   project:  process.env.TENDERLY_PROJECT ?? "trustbox",
  //   username: process.env.TENDERLY_USERNAME ?? "",
  //   privateVerification: true,
  // },

  etherscan: {
    // Snowtrace for Fuji verification
    apiKey: {
      avalancheFujiTestnet: process.env.SNOWTRACE_API_KEY ?? "abc",
    },
  },

  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },

  mocha: {
    timeout: 120_000,
  },
}

export default config