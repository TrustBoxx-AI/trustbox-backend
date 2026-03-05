// IntentVault.sol — Verifiable Intent Storage + Execution
// Avalanche Fuji Testnet
export const IntentVault = [
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: 'bytes32', name: 'intentId', type: 'bytes32' },
      { indexed: true,  internalType: 'address', name: 'submitter', type: 'address' },
      { indexed: false, internalType: 'string',  name: 'spec',     type: 'string'  },
      { indexed: false, internalType: 'uint256', name: 'timestamp', type: 'uint256' },
    ],
    name: 'IntentSubmitted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: 'bytes32', name: 'intentId',  type: 'bytes32' },
      { indexed: false, internalType: 'bool',    name: 'success',   type: 'bool'    },
      { indexed: false, internalType: 'string',  name: 'resultCID', type: 'string'  },
    ],
    name: 'IntentExecuted',
    type: 'event',
  },
  {
    inputs: [
      { internalType: 'string', name: 'spec',      type: 'string' },
      { internalType: 'bytes',  name: 'signature', type: 'bytes'  },
    ],
    name: 'submitIntent',
    outputs: [{ internalType: 'bytes32', name: 'intentId', type: 'bytes32' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'intentId',  type: 'bytes32' },
      { internalType: 'bool',    name: 'success',   type: 'bool'    },
      { internalType: 'string',  name: 'resultCID', type: 'string'  },
    ],
    name: 'markExecuted',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes32', name: 'intentId', type: 'bytes32' }],
    name: 'getIntent',
    outputs: [
      { internalType: 'address', name: 'submitter',  type: 'address' },
      { internalType: 'string',  name: 'spec',       type: 'string'  },
      { internalType: 'uint8',   name: 'status',     type: 'uint8'   },
      { internalType: 'string',  name: 'resultCID',  type: 'string'  },
      { internalType: 'uint256', name: 'timestamp',  type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const