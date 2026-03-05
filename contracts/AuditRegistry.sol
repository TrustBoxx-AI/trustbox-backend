// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title AuditRegistry — On-Chain Smart Contract Audit Anchoring
/// @notice Append-only registry of audit reports on Avalanche Fuji.
///         Anyone can verify a report by checking reportHash against the IPFS CID.
/// @dev Audit records are permanent — no deletion, no modification.
contract AuditRegistry is Ownable, ReentrancyGuard {

    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ── Structs ────────────────────────────────────────────────
    struct AuditRecord {
        uint256 auditId;
        address contractAddr;
        bytes32 reportHash;         // keccak256 of full report JSON
        bytes32 merkleRoot;         // Merkle root of findings array
        string  reportCID;          // IPFS CID of full report
        address auditor;            // server signer address
        uint256 timestamp;
        uint256 blockNumber;
        uint256 score;              // 0–100
    }

    // ── State ──────────────────────────────────────────────────
    uint256 private _nextAuditId;

    /// contractAddr → array of audit records (history)
    mapping(address => AuditRecord[]) private _auditHistory;

    /// auditId → (contractAddr, index) for direct lookup
    mapping(uint256 => address) private _auditIdToContract;

    /// Authorised auditor addresses (TrustBox server signers)
    mapping(address => bool) public authorisedAuditors;

    // ── Events ─────────────────────────────────────────────────
    event AuditSubmitted(
        uint256 indexed auditId,
        address indexed contractAddr,
        bytes32         reportHash,
        bytes32         merkleRoot,
        string          reportCID,
        address indexed auditor,
        uint256         score
    );

    event AuditorAdded(address indexed auditor);
    event AuditorRemoved(address indexed auditor);

    // ── Constructor ────────────────────────────────────────────
    constructor() Ownable(msg.sender) {
        // Owner is the first authorised auditor
        authorisedAuditors[msg.sender] = true;
        emit AuditorAdded(msg.sender);
    }

    // ── Auditor management ─────────────────────────────────────

    function addAuditor(address auditor) external onlyOwner {
        authorisedAuditors[auditor] = true;
        emit AuditorAdded(auditor);
    }

    function removeAuditor(address auditor) external onlyOwner {
        authorisedAuditors[auditor] = false;
        emit AuditorRemoved(auditor);
    }

    // ── Core functions ─────────────────────────────────────────

    /// @notice Anchor an audit report. Validates auditor signature.
    /// @param contractAddr  The audited contract address
    /// @param reportHash    keccak256 of the full report JSON
    /// @param merkleRoot    Merkle root of the findings array
    /// @param reportCID     IPFS CID of the full report
    /// @param auditorSig    Server-side signature over reportHash
    /// @param score         Audit score 0–100
    function submitAudit(
        address contractAddr,
        bytes32 reportHash,
        bytes32 merkleRoot,
        string  calldata reportCID,
        bytes   calldata auditorSig,
        uint256 score
    ) external nonReentrant returns (uint256 auditId) {
        require(contractAddr != address(0),    "AuditRegistry: zero contractAddr");
        require(reportHash != bytes32(0),      "AuditRegistry: empty reportHash");
        require(bytes(reportCID).length > 0,   "AuditRegistry: empty reportCID");
        require(score <= 100,                  "AuditRegistry: score out of range");

        // Recover signer from auditorSig
        address signer = reportHash
            .toEthSignedMessageHash()
            .recover(auditorSig);

        require(authorisedAuditors[signer], "AuditRegistry: unauthorised auditor");

        auditId = _nextAuditId++;

        AuditRecord memory record = AuditRecord({
            auditId:     auditId,
            contractAddr:contractAddr,
            reportHash:  reportHash,
            merkleRoot:  merkleRoot,
            reportCID:   reportCID,
            auditor:     signer,
            timestamp:   block.timestamp,
            blockNumber: block.number,
            score:       score
        });

        _auditHistory[contractAddr].push(record);
        _auditIdToContract[auditId] = contractAddr;

        emit AuditSubmitted(auditId, contractAddr, reportHash, merkleRoot, reportCID, signer, score);
    }

    // ── View functions ─────────────────────────────────────────

    /// @notice Get the most recent audit for a contract
    function getAudit(address contractAddr) external view returns (AuditRecord memory) {
        AuditRecord[] storage history = _auditHistory[contractAddr];
        require(history.length > 0, "AuditRegistry: no audit found");
        return history[history.length - 1];
    }

    /// @notice Get full audit history for a contract
    function getAuditHistory(address contractAddr) external view returns (AuditRecord[] memory) {
        return _auditHistory[contractAddr];
    }

    /// @notice Verify a report hash matches any recorded audit
    function verifyReport(address contractAddr, bytes32 reportHash) external view returns (bool) {
        AuditRecord[] storage history = _auditHistory[contractAddr];
        for (uint i = 0; i < history.length; i++) {
            if (history[i].reportHash == reportHash) return true;
        }
        return false;
    }

    /// @notice Total audits submitted
    function totalAudits() external view returns (uint256) {
        return _nextAuditId;
    }
}
