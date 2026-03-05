// AuditRegistry.sol — On-chain audit anchoring
// Avalanche Fuji Testnet
export const AuditRegistry = [
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: 'address', name: 'contractAddr', type: 'address' },
      { indexed: false, internalType: 'bytes32', name: 'reportHash',   type: 'bytes32' },
      { indexed: false, internalType: 'string',  name: 'reportCID',    type: 'string'  },
      { indexed: false, internalType: 'uint256', name: 'timestamp',    type: 'uint256' },
    ],
    name: 'AuditAnchored',
    type: 'event',
  },
  {
    inputs: [
      { internalType: 'address', name: 'contractAddr', type: 'address' },
      { internalType: 'bytes32', name: 'reportHash',   type: 'bytes32' },
      { internalType: 'bytes32', name: 'merkleRoot',   type: 'bytes32' },
      { internalType: 'string',  name: 'reportCID',    type: 'string'  },
    ],
    name: 'submitAudit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'contractAddr', type: 'address' }],
    name: 'getAudit',
    outputs: [
      { internalType: 'bytes32', name: 'reportHash', type: 'bytes32' },
      { internalType: 'bytes32', name: 'merkleRoot', type: 'bytes32' },
      { internalType: 'string',  name: 'reportCID',  type: 'string'  },
      { internalType: 'uint256', name: 'timestamp',  type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const