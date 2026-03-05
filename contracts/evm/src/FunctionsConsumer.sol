// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  FunctionsConsumer
 * @notice TrustBox Chainlink Functions consumer.
 *         Sends NL intent parse requests to the DON and stores results.
 * @dev    Deploy on Avalanche Fuji.
 *         Subscription ID must be funded with LINK before use.
 */

import {FunctionsClient}  from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import {ConfirmedOwner}   from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";

contract FunctionsConsumer is FunctionsClient, ConfirmedOwner {
    using FunctionsRequest for FunctionsRequest.Request;

    // ── Events ────────────────────────────────────────────────
    event IntentParsed(
        bytes32 indexed requestId,
        string  specJson,
        bytes   err
    );

    event RequestSent(
        bytes32 indexed requestId,
        address indexed requester
    );

    // ── State ─────────────────────────────────────────────────
    bytes32 public donId;
    uint64  public subscriptionId;
    uint32  public gasLimit = 300_000;

    // requestId → requester
    mapping(bytes32 => address) public requesters;

    // requestId → parsed spec JSON
    mapping(bytes32 => string) public parsedSpecs;

    // requestId → error
    mapping(bytes32 => bytes) public errors;

    // Latest request for polling
    bytes32 public latestRequestId;
    string  public latestSpec;

    // ── Constructor ───────────────────────────────────────────
    constructor(
        address router,
        bytes32 _donId,
        uint64  _subscriptionId
    )
        FunctionsClient(router)
        ConfirmedOwner(msg.sender)
    {
        donId          = _donId;
        subscriptionId = _subscriptionId;
    }

    // ── Send parse request ────────────────────────────────────
    function sendParseRequest(
        string calldata source,
        string[] calldata args,
        bytes calldata encryptedSecretsRef
    ) external returns (bytes32 requestId) {
        FunctionsRequest.Request memory req;
        req.initializeRequest(
            FunctionsRequest.Location.Inline,
            FunctionsRequest.CodeLanguage.JavaScript,
            source
        );

        if (encryptedSecretsRef.length > 0) {
            req.addDONHostedSecrets(
                0,   // slotId
                0    // version — set via updateSecrets()
            );
        }

        if (args.length > 0) {
            req.setArgs(args);
        }

        requestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
            gasLimit,
            donId
        );

        requesters[requestId]  = msg.sender;
        latestRequestId        = requestId;

        emit RequestSent(requestId, msg.sender);
    }

    // ── Fulfillment callback ──────────────────────────────────
    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        if (err.length > 0) {
            errors[requestId] = err;
            emit IntentParsed(requestId, "", err);
            return;
        }

        string memory specJson = string(response);
        parsedSpecs[requestId] = specJson;
        latestSpec             = specJson;

        emit IntentParsed(requestId, specJson, "");
    }

    // ── Admin ─────────────────────────────────────────────────
    function updateSubscription(uint64 _subscriptionId) external onlyOwner {
        subscriptionId = _subscriptionId;
    }

    function updateGasLimit(uint32 _gasLimit) external onlyOwner {
        gasLimit = _gasLimit;
    }

    function updateDonId(bytes32 _donId) external onlyOwner {
        donId = _donId;
    }

    // ── View ──────────────────────────────────────────────────
    function getSpec(bytes32 requestId) external view returns (string memory) {
        return parsedSpecs[requestId];
    }

    function getError(bytes32 requestId) external view returns (bytes memory) {
        return errors[requestId];
    }
}
