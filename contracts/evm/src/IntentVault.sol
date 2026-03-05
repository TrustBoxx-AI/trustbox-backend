// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title IntentVault — Verifiable Intent Storage + Execution
/// @notice Stores user intents on-chain, triggers CRE workflow via log,
///         and records execution results. Acts as the source of truth
///         for all verifiable actions (book travel, DeFi swap, agent tasks).
/// @dev CRE workflow listens to IntentSubmitted event via logTrigger.
///      After execution, CRE calls markExecuted via writeReport → receiver.
contract IntentVault is Ownable, ReentrancyGuard {

    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ── Enums ──────────────────────────────────────────────────
    enum IntentStatus { Pending, Executing, Executed, Failed, Cancelled }

    // ── Structs ────────────────────────────────────────────────
    struct Intent {
        bytes32     intentId;
        address     submitter;
        string      spec;           // JSON: { action, entity, params }
        IntentStatus status;
        string      resultCID;      // IPFS CID of execution result
        bool        success;
        uint256     submittedAt;
        uint256     executedAt;
        uint256     nonce;
    }

    // ── State ──────────────────────────────────────────────────
    /// intentId → Intent
    mapping(bytes32 => Intent) private _intents;

    /// submitter → list of intentIds
    mapping(address => bytes32[]) private _userIntents;

    /// submitter → nonce (replay protection)
    mapping(address => uint256) public nonces;

    /// Authorised executors (CRE workflow receiver address)
    mapping(address => bool) public authorisedExecutors;

    // ── Events ─────────────────────────────────────────────────
    /// @notice Emitted when a new intent is submitted — triggers CRE logTrigger
    event IntentSubmitted(
        bytes32 indexed intentId,
        address indexed submitter,
        string          spec,
        uint256         timestamp
    );

    /// @notice Emitted when CRE marks an intent as executed
    event IntentExecuted(
        bytes32 indexed intentId,
        bool            success,
        string          resultCID,
        uint256         timestamp
    );

    event IntentCancelled(bytes32 indexed intentId);
    event ExecutorAdded(address indexed executor);
    event ExecutorRemoved(address indexed executor);

    // ── Constructor ────────────────────────────────────────────
    constructor() Ownable(msg.sender) {
        authorisedExecutors[msg.sender] = true;
    }

    // ── Executor management ────────────────────────────────────

    function addExecutor(address executor) external onlyOwner {
        authorisedExecutors[executor] = true;
        emit ExecutorAdded(executor);
    }

    function removeExecutor(address executor) external onlyOwner {
        authorisedExecutors[executor] = false;
        emit ExecutorRemoved(executor);
    }

    // ── Core functions ─────────────────────────────────────────

    /// @notice Submit a new intent — emits IntentSubmitted to trigger CRE workflow
    /// @param spec      JSON string: { "action": "book_travel", "entity": "...", "params": {...} }
    /// @param signature ECDSA signature over keccak256(spec + nonce) for auth
    /// @return intentId Unique identifier for this intent
    function submitIntent(
        string   calldata spec,
        bytes    calldata signature
    ) external nonReentrant returns (bytes32 intentId) {
        require(bytes(spec).length > 0,      "IntentVault: empty spec");
        require(bytes(spec).length <= 4096,  "IntentVault: spec too long");

        // Verify signature
        uint256 nonce = nonces[msg.sender];
        bytes32 msgHash = keccak256(abi.encodePacked(msg.sender, spec, nonce));
        address signer  = msgHash.toEthSignedMessageHash().recover(signature);
        require(signer == msg.sender, "IntentVault: invalid signature");

        // Generate deterministic intentId
        intentId = keccak256(abi.encodePacked(msg.sender, spec, nonce, block.timestamp));

        require(_intents[intentId].submittedAt == 0, "IntentVault: duplicate intent");

        nonces[msg.sender]++;

        _intents[intentId] = Intent({
            intentId:    intentId,
            submitter:   msg.sender,
            spec:        spec,
            status:      IntentStatus.Pending,
            resultCID:   "",
            success:     false,
            submittedAt: block.timestamp,
            executedAt:  0,
            nonce:       nonce
        });

        _userIntents[msg.sender].push(intentId);

        emit IntentSubmitted(intentId, msg.sender, spec, block.timestamp);
    }

    /// @notice Called by CRE workflow (via writeReport receiver) after execution
    /// @param intentId  The intent being resolved
    /// @param success   Whether execution succeeded
    /// @param resultCID IPFS CID of full execution result
    function markExecuted(
        bytes32        intentId,
        bool           success,
        string calldata resultCID
    ) external nonReentrant {
        require(authorisedExecutors[msg.sender], "IntentVault: unauthorised executor");
        require(bytes(resultCID).length > 0,     "IntentVault: empty resultCID");

        Intent storage intent = _intents[intentId];
        require(intent.submittedAt > 0,          "IntentVault: intent not found");
        require(
            intent.status == IntentStatus.Pending ||
            intent.status == IntentStatus.Executing,
            "IntentVault: intent not pending"
        );

        intent.status    = success ? IntentStatus.Executed : IntentStatus.Failed;
        intent.success   = success;
        intent.resultCID = resultCID;
        intent.executedAt = block.timestamp;

        emit IntentExecuted(intentId, success, resultCID, block.timestamp);
    }

    /// @notice Cancel a pending intent (submitter only)
    function cancelIntent(bytes32 intentId) external nonReentrant {
        Intent storage intent = _intents[intentId];
        require(intent.submitter == msg.sender,       "IntentVault: not submitter");
        require(intent.status == IntentStatus.Pending, "IntentVault: not pending");

        intent.status = IntentStatus.Cancelled;
        emit IntentCancelled(intentId);
    }

    // ── View functions ─────────────────────────────────────────

    function getIntent(bytes32 intentId) external view returns (Intent memory) {
        require(_intents[intentId].submittedAt > 0, "IntentVault: not found");
        return _intents[intentId];
    }

    function getUserIntents(address user) external view returns (bytes32[] memory) {
        return _userIntents[user];
    }

    function getIntentStatus(bytes32 intentId) external view returns (IntentStatus) {
        return _intents[intentId].status;
    }
}
