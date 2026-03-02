// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IERC8004.sol";
import "./libraries/HashLib.sol";

/// @title TrustRegistry — ERC-8004 AI Agent Credential NFT
/// @notice Mints verifiable identity credentials for AI agents on Avalanche Fuji
/// @dev Implements IERC8004, extends ERC-721 (OpenZeppelin v5)
contract TrustRegistry is ERC721URIStorage, Ownable, ReentrancyGuard, IERC8004 {

    using HashLib for string;

    // ── State ──────────────────────────────────────────────────
    uint256 private _nextTokenId;

    /// tokenId → AgentRecord
    mapping(uint256 => AgentRecord) private _agents;

    /// agentId hash → tokenId (deduplication)
    mapping(bytes32 => uint256) private _agentIdToToken;

    /// operator → list of tokenIds
    mapping(address => uint256[]) private _operatorTokens;

    // ── Constructor ────────────────────────────────────────────
    constructor() ERC721("TrustBox Agent Credential", "TBAC") Ownable(msg.sender) {}

    // ── ERC-8004 Implementation ────────────────────────────────

    /// @inheritdoc IERC8004
    function mintCredential(
        string  calldata agentId,
        bytes32          modelHash,
        address          operator,
        bytes32          capabilityHash,
        string  calldata metadataURI
    ) external override onlyOwner nonReentrant returns (uint256 tokenId) {
        require(bytes(agentId).length > 0,    "TrustRegistry: empty agentId");
        require(modelHash != bytes32(0),       "TrustRegistry: empty modelHash");
        require(operator != address(0),        "TrustRegistry: zero operator");
        require(bytes(metadataURI).length > 0, "TrustRegistry: empty metadataURI");

        // Prevent duplicate agentId per operator
        bytes32 key = HashLib.agentKey(agentId, operator);
        require(_agentIdToToken[key] == 0, "TrustRegistry: agent already registered");

        tokenId = _nextTokenId++;

        _safeMint(operator, tokenId);
        _setTokenURI(tokenId, metadataURI);

        _agents[tokenId] = AgentRecord({
            agentId:        agentId,
            modelHash:      modelHash,
            operator:       operator,
            capabilityHash: capabilityHash,
            metadataURI:    metadataURI,
            trustScore:     70,              // default score — updated after verification
            mintedAt:       block.timestamp,
            isRevoked:      false
        });

        _agentIdToToken[key] = tokenId + 1; // +1 so 0 means "not registered"
        _operatorTokens[operator].push(tokenId);

        emit AgentRegistered(tokenId, agentId, operator, modelHash, 70);
    }

    /// @inheritdoc IERC8004
    function verifyAgent(uint256 tokenId) external view override returns (AgentRecord memory) {
        require(_ownerOf(tokenId) != address(0), "TrustRegistry: token does not exist");
        return _agents[tokenId];
    }

    /// @inheritdoc IERC8004
    function updateScore(
        uint256 tokenId,
        uint256 newScore,
        string calldata reason
    ) external override onlyOwner {
        require(_ownerOf(tokenId) != address(0), "TrustRegistry: token does not exist");
        require(!_agents[tokenId].isRevoked,      "TrustRegistry: credential revoked");
        require(newScore <= 100,                   "TrustRegistry: score out of range");

        uint256 oldScore = _agents[tokenId].trustScore;
        _agents[tokenId].trustScore = newScore;

        emit ScoreUpdated(tokenId, oldScore, newScore, reason);
    }

    /// @inheritdoc IERC8004
    function revokeCredential(uint256 tokenId, string calldata reason) external override onlyOwner {
        require(_ownerOf(tokenId) != address(0), "TrustRegistry: token does not exist");
        require(!_agents[tokenId].isRevoked,      "TrustRegistry: already revoked");

        _agents[tokenId].isRevoked = true;

        emit CredentialRevoked(tokenId, reason);
    }

    /// @inheritdoc IERC8004
    function getAgentsByOperator(address operator) external view override returns (uint256[] memory) {
        return _operatorTokens[operator];
    }

    // ── View helpers ───────────────────────────────────────────

    /// @notice Check if an agentId is already registered for an operator
    function isRegistered(string calldata agentId, address operator) external view returns (bool) {
        return _agentIdToToken[HashLib.agentKey(agentId, operator)] != 0;
    }

    /// @notice Total credentials minted
    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }
}
