// TrustRegistry.sol — ERC-8004 Agent Credential NFT
// Avalanche Fuji Testnet
export const TrustRegistry = [
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: 'address', name: 'agent',   type: 'address' },
      { indexed: true,  internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'score',   type: 'uint256' },
    ],
    name: 'AgentVerified',
    type: 'event',
  },
  {
    inputs: [
      { internalType: 'address', name: 'agent',    type: 'address' },
      { internalType: 'uint256', name: 'score',    type: 'uint256' },
      { internalType: 'string',  name: 'metadataURI', type: 'string' },
    ],
    name: 'mintCredential',
    outputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'getCredential',
    outputs: [
      { internalType: 'address', name: 'agent',      type: 'address' },
      { internalType: 'uint256', name: 'score',      type: 'uint256' },
      { internalType: 'uint256', name: 'issuedAt',   type: 'uint256' },
      { internalType: 'string',  name: 'metadataURI', type: 'string' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'uint256', name: 'score',   type: 'uint256' },
    ],
    name: 'updateScore',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'agent', type: 'address' }],
    name: 'getTokenId',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const