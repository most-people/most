export const MOSTBOX_WALLET_ABI = [
  {
    inputs: [
      { internalType: "address", name: "_usdt", type: "address" },
      { internalType: "uint256", name: "_maxWithdrawalPerTx", type: "uint256" },
      { internalType: "uint256", name: "_withdrawalFeeBps", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  { inputs: [], name: "EnforcedPause", type: "error" },
  { inputs: [], name: "ExpectedPause", type: "error" },
  { inputs: [{ internalType: "address", name: "owner", type: "address" }], name: "OwnableInvalidOwner", type: "error" },
  { inputs: [{ internalType: "address", name: "account", type: "address" }], name: "OwnableUnauthorizedAccount", type: "error" },
  { inputs: [], name: "ReentrancyGuardReentrantCall", type: "error" },
  {
    anonymous: false,
    inputs: [
      { internalType: "address", name: "user", type: "address", indexed: true },
      { internalType: "uint256", name: "amount", type: "uint256", indexed: false },
    ],
    name: "Deposited",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { internalType: "address", name: "owner", type: "address", indexed: true },
      { internalType: "uint256", name: "amount", type: "uint256", indexed: false },
    ],
    name: "FeeWithdrawn",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { internalType: "address", name: "from", type: "address", indexed: true },
      { internalType: "address", name: "to", type: "address", indexed: true },
      { internalType: "uint256", name: "amount", type: "uint256", indexed: false },
    ],
    name: "InternalTransfer",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [{ internalType: "uint256", name: "newLimit", type: "uint256", indexed: false }],
    name: "MaxWithdrawalUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [{ internalType: "bool", name: "paused", type: "bool", indexed: false }],
    name: "PausedStateChanged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { internalType: "address", name: "previousOwner", type: "address", indexed: true },
      { internalType: "address", name: "newOwner", type: "address", indexed: true },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { internalType: "address", name: "user", type: "address", indexed: true },
      { internalType: "address", name: "to", type: "address", indexed: true },
      { internalType: "uint256", name: "amount", type: "uint256", indexed: false },
      { internalType: "uint256", name: "fee", type: "uint256", indexed: false },
    ],
    name: "Withdrawn",
    type: "event",
  },
  {
    inputs: [],
    name: "accumulatedFees",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "balances",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
    name: "deposit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "nonce", type: "uint256" },
      { internalType: "bytes", name: "signature", type: "bytes" },
    ],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "internalTransfer",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "nonces",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "maxWithdrawalPerTx",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "withdrawalFeeBps",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "paused",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "usdt",
    outputs: [{ internalType: "contract IERC20", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "withdrawFees",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "newLimit", type: "uint256" }],
    name: "setMaxWithdrawal",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "newFeeBps", type: "uint256" }],
    name: "setWithdrawalFee",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bool", name: "_paused", type: "bool" }],
    name: "setPaused",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "user", type: "address" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "nonce", type: "uint256" },
      { internalType: "bytes", name: "signature", type: "bytes" },
    ],
    name: "verifySignature",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "nonce", type: "uint256" },
    ],
    name: "getWithdrawMessageHash",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "newOwner", type: "address" }],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const

export const CONTRACT_CONFIG = {
  // Base Sepolia 测试网配置
  baseSepolia: {
    chainId: 84532,
    name: "Base Sepolia",
    rpcUrl: "https://sepolia.base.org",
    blockExplorer: "https://sepolia.basescan.org",
    // 部署后替换为实际地址
    contractAddress: process.env.NEXT_PUBLIC_WALLET_CONTRACT_ADDRESS || "",
    usdtAddress: process.env.NEXT_PUBLIC_USDT_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDT
  },
  // Base 主网配置
  baseMainnet: {
    chainId: 8453,
    name: "Base",
    rpcUrl: "https://mainnet.base.org",
    blockExplorer: "https://basescan.org",
    contractAddress: process.env.NEXT_PUBLIC_WALLET_CONTRACT_ADDRESS || "",
    usdtAddress: process.env.NEXT_PUBLIC_USDT_ADDRESS || "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", // Base USDT
  },
}

export const USDT_DECIMALS = 6
export const FEE_BPS = 50 // 0.5%
