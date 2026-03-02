// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IERC-8004 — AI Agent Non-Fungible Token Standard
/// @notice Interface for on-chain AI agent identity credentials
/// @dev Extends ERC-721 with agent-specific metadata and trust scoring
interface IERC8004 {

    // ── Events ─────────────────────────────────────────────────
    event AgentRegistered(
        uint256 indexed tokenId,
        string  indexed agentId,
        address indexed operator,
        bytes32         modelHash,
        uint256         trustScore
    );

    event ScoreUpdated(
        uint256 indexed tokenId,
        uint256         oldScore,
        uint256         newScore,
        string          reason
    );

    event CredentialRevoked(
        uint256 indexed tokenId,
        string          reason
    );

    // ── Structs ────────────────────────────────────────────────
    struct AgentRecord {
        string  agentId;        // off-chain agent identifier
        bytes32 modelHash;      // SHA-256 of model weights/manifest
        address operator;       // wallet that owns/operates the agent
        bytes32 capabilityHash; // hash of declared capability set
        string  metadataURI;    // IPFS URI for full metadata JSON
        uint256 trustScore;     // 0–100
        uint256 mintedAt;       // block.timestamp at mint
        bool    isRevoked;      // revocation flag
    }

    // ── Functions ──────────────────────────────────────────────

    /// @notice Mint an ERC-8004 credential for a verified AI agent
    function mintCredential(
        string  calldata agentId,
        bytes32          modelHash,
        address          operator,
        bytes32          capabilityHash,
        string  calldata metadataURI
    ) external returns (uint256 tokenId);

    /// @notice Retrieve the full agent record for a token
    function verifyAgent(uint256 tokenId) external view returns (AgentRecord memory);

    /// @notice Update trust score (owner only)
    function updateScore(uint256 tokenId, uint256 newScore, string calldata reason) external;

    /// @notice Revoke a credential (owner only)
    function revokeCredential(uint256 tokenId, string calldata reason) external;

    /// @notice Get all token IDs for a given operator address
    function getAgentsByOperator(address operator) external view returns (uint256[] memory);
}
