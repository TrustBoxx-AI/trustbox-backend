// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title HashLib — Shared hashing helpers for TrustBox contracts
library HashLib {

    /// @notice Hash a string (e.g. agentId, category)
    function hashString(string calldata s) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(s));
    }

    /// @notice Hash agent identity fields for deduplication
    function agentKey(string calldata agentId, address operator) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(agentId, operator));
    }

    /// @notice Hash an intent spec for on-chain commitment
    function intentKey(bytes32 nlHash, bytes32 specHash, address requester) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(nlHash, specHash, requester));
    }

    /// @notice EIP-712 style digest for signing
    function eip712Digest(
        bytes32 domainSeparator,
        bytes32 structHash
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }
}
