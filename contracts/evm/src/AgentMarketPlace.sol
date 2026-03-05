// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title AgentMarketplace — TEE Agent Staking, Registration & Job Dispatch
/// @notice Agents stake AVAX to register. Users dispatch blind audit jobs.
///         Phala TEE agents process jobs off-chain and post results here.
/// @dev Integrates with TrustRegistry for ERC-8004 credential verification.
contract AgentMarketplace is Ownable, ReentrancyGuard {

    using SafeERC20 for IERC20;

    // ── Constants ──────────────────────────────────────────────
    uint256 public constant MIN_STAKE       = 0.1 ether;   // 0.1 AVAX minimum stake
    uint256 public constant JOB_EXPIRY      = 24 hours;
    uint256 public constant DISPUTE_WINDOW  = 48 hours;

    // ── Enums ──────────────────────────────────────────────────
    enum AgentStatus { Inactive, Active, Busy, Slashed }
    enum JobStatus   { Open, Assigned, Completed, Failed, Disputed, Expired }

    // ── Structs ────────────────────────────────────────────────
    struct Agent {
        string      agentId;
        address     operator;
        string      teeEndpoint;        // Phala Phat contract URL
        bytes       encPubKey;          // Encryption public key for blind jobs
        uint256     stake;              // AVAX staked
        uint256     tokenId;            // ERC-8004 token from TrustRegistry (0 = not minted yet)
        uint256     jobsCompleted;
        uint256     jobsFailed;
        uint256     registeredAt;
        AgentStatus status;
    }

    struct Job {
        uint256     jobId;
        address     requester;
        bytes32     agentKey;           // keccak256(agentId, operator)
        bytes       encryptedPayload;   // Encrypted with agent's encPubKey
        bytes32     payloadHash;        // keccak256 of plaintext — for result verification
        string      resultCID;          // IPFS CID of encrypted result
        bytes32     resultHash;         // keccak256 of result
        uint256     fee;                // AVAX fee locked for this job
        uint256     createdAt;
        uint256     completedAt;
        JobStatus   status;
    }

    // ── State ──────────────────────────────────────────────────
    uint256 private _nextJobId;

    /// agentKey → Agent
    mapping(bytes32 => Agent) private _agents;

    /// operator → list of agentKeys
    mapping(address => bytes32[]) private _operatorAgents;

    /// jobId → Job
    mapping(uint256 => Job) private _jobs;

    /// agentKey → list of jobIds
    mapping(bytes32 => uint256[]) private _agentJobs;

    /// requester → list of jobIds
    mapping(address => uint256[]) private _requesterJobs;

    /// Platform fee (basis points, e.g. 200 = 2%)
    uint256 public platformFeeBps = 200;
    uint256 public platformFeeAccrued;

    // ── Events ─────────────────────────────────────────────────
    event AgentRegistered(
        bytes32 indexed agentKey,
        string          agentId,
        address indexed operator,
        string          teeEndpoint,
        uint256         stake
    );

    event AgentStakeUpdated(bytes32 indexed agentKey, uint256 newStake);
    event AgentStatusChanged(bytes32 indexed agentKey, AgentStatus status);

    event JobCreated(
        uint256 indexed jobId,
        address indexed requester,
        bytes32 indexed agentKey,
        uint256         fee
    );

    event JobCompleted(
        uint256 indexed jobId,
        bytes32 indexed agentKey,
        string          resultCID,
        bytes32         resultHash
    );

    event JobFailed(uint256 indexed jobId, bytes32 indexed agentKey);
    event JobDisputed(uint256 indexed jobId, address indexed disputer);
    event AgentSlashed(bytes32 indexed agentKey, uint256 slashedAmount);

    // ── Constructor ────────────────────────────────────────────
    constructor() Ownable(msg.sender) {}

    // ── Agent registration ─────────────────────────────────────

    /// @notice Register a TEE agent with stake
    /// @param agentId      Unique agent identifier (matches TrustRegistry)
    /// @param teeEndpoint  Phala Phat contract URL
    /// @param encPubKey    Encryption public key (65 bytes, uncompressed secp256k1)
    function registerAgent(
        string  calldata agentId,
        string  calldata teeEndpoint,
        bytes   calldata encPubKey
    ) external payable nonReentrant {
        require(bytes(agentId).length > 0,      "Marketplace: empty agentId");
        require(bytes(teeEndpoint).length > 0,  "Marketplace: empty endpoint");
        require(encPubKey.length == 65,         "Marketplace: invalid pubkey");
        require(msg.value >= MIN_STAKE,         "Marketplace: insufficient stake");

        bytes32 key = _agentKey(agentId, msg.sender);
        require(_agents[key].registeredAt == 0, "Marketplace: already registered");

        _agents[key] = Agent({
            agentId:       agentId,
            operator:      msg.sender,
            teeEndpoint:   teeEndpoint,
            encPubKey:     encPubKey,
            stake:         msg.value,
            tokenId:       0,
            jobsCompleted: 0,
            jobsFailed:    0,
            registeredAt:  block.timestamp,
            status:        AgentStatus.Active
        });

        _operatorAgents[msg.sender].push(key);

        emit AgentRegistered(key, agentId, msg.sender, teeEndpoint, msg.value);
    }

    /// @notice Add more stake to an existing agent
    function topUpStake(string calldata agentId) external payable nonReentrant {
        bytes32 key = _agentKey(agentId, msg.sender);
        require(_agents[key].registeredAt > 0, "Marketplace: not registered");
        require(msg.value > 0,                  "Marketplace: zero stake");

        _agents[key].stake += msg.value;
        emit AgentStakeUpdated(key, _agents[key].stake);
    }

    /// @notice Link an ERC-8004 tokenId to this agent after TrustRegistry mint
    function setTokenId(string calldata agentId, uint256 tokenId) external {
        bytes32 key = _agentKey(agentId, msg.sender);
        require(_agents[key].registeredAt > 0,  "Marketplace: not registered");
        require(_agents[key].operator == msg.sender, "Marketplace: not operator");
        _agents[key].tokenId = tokenId;
    }

    // ── Job dispatch ───────────────────────────────────────────

    /// @notice Dispatch a blind audit job to a specific TEE agent
    /// @param agentId          Target agent identifier
    /// @param agentOperator    Target agent's operator address
    /// @param encryptedPayload Payload encrypted with agent's encPubKey
    /// @param payloadHash      keccak256 of plaintext payload (for verification)
    function createJob(
        string  calldata agentId,
        address          agentOperator,
        bytes   calldata encryptedPayload,
        bytes32          payloadHash
    ) external payable nonReentrant returns (uint256 jobId) {
        require(bytes(encryptedPayload).length > 0, "Marketplace: empty payload");
        require(payloadHash != bytes32(0),           "Marketplace: empty payloadHash");
        require(msg.value > 0,                       "Marketplace: fee required");

        bytes32 key = _agentKey(agentId, agentOperator);
        Agent storage agent = _agents[key];
        require(agent.registeredAt > 0,              "Marketplace: agent not found");
        require(agent.status == AgentStatus.Active,  "Marketplace: agent not available");

        jobId = _nextJobId++;

        _jobs[jobId] = Job({
            jobId:            jobId,
            requester:        msg.sender,
            agentKey:         key,
            encryptedPayload: encryptedPayload,
            payloadHash:      payloadHash,
            resultCID:        "",
            resultHash:       bytes32(0),
            fee:              msg.value,
            createdAt:        block.timestamp,
            completedAt:      0,
            status:           JobStatus.Open
        });

        _agentJobs[key].push(jobId);
        _requesterJobs[msg.sender].push(jobId);

        // Mark agent as busy
        agent.status = AgentStatus.Busy;

        emit JobCreated(jobId, msg.sender, key, msg.value);
    }

    /// @notice TEE agent submits result after processing a job
    /// @param jobId      The job being completed
    /// @param resultCID  IPFS CID of encrypted result
    /// @param resultHash keccak256 of result (for verification)
    function submitResult(
        uint256        jobId,
        string calldata resultCID,
        bytes32         resultHash
    ) external nonReentrant {
        Job storage job = _jobs[jobId];
        require(job.createdAt > 0,             "Marketplace: job not found");
        require(job.status == JobStatus.Open || job.status == JobStatus.Assigned,
                                               "Marketplace: job not open");

        Agent storage agent = _agents[job.agentKey];
        require(agent.operator == msg.sender,  "Marketplace: not agent operator");
        require(bytes(resultCID).length > 0,   "Marketplace: empty resultCID");
        require(resultHash != bytes32(0),      "Marketplace: empty resultHash");

        // Check not expired
        if (block.timestamp > job.createdAt + JOB_EXPIRY) {
            job.status = JobStatus.Expired;
            agent.status = AgentStatus.Active;
            agent.jobsFailed++;
            emit JobFailed(jobId, job.agentKey);
            return;
        }

        job.resultCID   = resultCID;
        job.resultHash  = resultHash;
        job.status      = JobStatus.Completed;
        job.completedAt = block.timestamp;

        agent.status = AgentStatus.Active;
        agent.jobsCompleted++;

        // Pay agent (minus platform fee)
        uint256 fee         = job.fee;
        uint256 platformFee = (fee * platformFeeBps) / 10_000;
        uint256 agentPayout = fee - platformFee;

        platformFeeAccrued += platformFee;

        (bool ok, ) = agent.operator.call{value: agentPayout}("");
        require(ok, "Marketplace: payout failed");

        emit JobCompleted(jobId, job.agentKey, resultCID, resultHash);
    }

    /// @notice Requester disputes a completed job within DISPUTE_WINDOW
    function disputeJob(uint256 jobId) external nonReentrant {
        Job storage job = _jobs[jobId];
        require(job.requester == msg.sender,          "Marketplace: not requester");
        require(job.status == JobStatus.Completed,    "Marketplace: not completed");
        require(
            block.timestamp <= job.completedAt + DISPUTE_WINDOW,
            "Marketplace: dispute window closed"
        );

        job.status = JobStatus.Disputed;
        emit JobDisputed(jobId, msg.sender);
    }

    /// @notice Owner resolves a dispute — slash agent or refund requester
    function resolveDispute(uint256 jobId, bool slashAgent) external onlyOwner nonReentrant {
        Job storage job = _jobs[jobId];
        require(job.status == JobStatus.Disputed, "Marketplace: not disputed");

        Agent storage agent = _agents[job.agentKey];

        if (slashAgent) {
            // Slash 10% of agent stake, refund requester
            uint256 slashAmt = agent.stake / 10;
            agent.stake     -= slashAmt;
            agent.status     = AgentStatus.Slashed;
            agent.jobsFailed++;

            (bool ok, ) = job.requester.call{value: job.fee + slashAmt}("");
            require(ok, "Marketplace: refund failed");

            emit AgentSlashed(job.agentKey, slashAmt);
        }

        job.status = JobStatus.Failed;
        emit JobFailed(jobId, job.agentKey);
    }

    // ── Admin ──────────────────────────────────────────────────

    function setPlatformFee(uint256 bps) external onlyOwner {
        require(bps <= 1000, "Marketplace: max 10%");
        platformFeeBps = bps;
    }

    function withdrawPlatformFees() external onlyOwner nonReentrant {
        uint256 amt = platformFeeAccrued;
        platformFeeAccrued = 0;
        (bool ok, ) = owner().call{value: amt}("");
        require(ok, "Marketplace: withdraw failed");
    }

    // ── View functions ─────────────────────────────────────────

    function getAgent(string calldata agentId, address operator)
        external view returns (Agent memory)
    {
        return _agents[_agentKey(agentId, operator)];
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        require(_jobs[jobId].createdAt > 0, "Marketplace: job not found");
        return _jobs[jobId];
    }

    function getAgentJobs(string calldata agentId, address operator)
        external view returns (uint256[] memory)
    {
        return _agentJobs[_agentKey(agentId, operator)];
    }

    function getRequesterJobs(address requester) external view returns (uint256[] memory) {
        return _requesterJobs[requester];
    }

    function getOperatorAgents(address operator) external view returns (bytes32[] memory) {
        return _operatorAgents[operator];
    }

    function isAgentAvailable(string calldata agentId, address operator)
        external view returns (bool)
    {
        return _agents[_agentKey(agentId, operator)].status == AgentStatus.Active;
    }

    function totalJobs() external view returns (uint256) {
        return _nextJobId;
    }

    // ── Internal ───────────────────────────────────────────────

    function _agentKey(string calldata agentId, address operator)
        internal pure returns (bytes32)
    {
        return keccak256(abi.encodePacked(agentId, operator));
    }

    // Allow contract to receive AVAX
    receive() external payable {}
}
