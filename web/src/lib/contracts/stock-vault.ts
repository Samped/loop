export const stockVaultAbi = [
  { type: "error", name: "NotSolvent", inputs: [] },
  { type: "error", name: "InsufficientReserve", inputs: [] },
  { type: "error", name: "PriceNotSet", inputs: [] },
  { type: "error", name: "ZeroAmount", inputs: [] },
  { type: "error", name: "SlippageExceeded", inputs: [] },
  { type: "error", name: "InsufficientShares", inputs: [] },
  {
    type: "function",
    name: "buy",
    inputs: [
      { name: "ticker", type: "string" },
      { name: "usdcAmount", type: "uint256" },
      { name: "minShares", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "sell",
    inputs: [
      { name: "ticker", type: "string" },
      { name: "shares", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setPrices",
    inputs: [
      { name: "tickers", type: "string[]" },
      { name: "newPrices", type: "uint256[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "depositReserve",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getHoldings",
    inputs: [
      { name: "user", type: "address" },
      { name: "ticker", type: "string" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "reserveBalance",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalLiabilities",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isSolvent",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "reserveRatio",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "circulatingShares",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "prices",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "usdc",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Buy",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "ticker", type: "bytes32", indexed: true },
      { name: "shares", type: "uint256", indexed: false },
      { name: "usdcPaid", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Sell",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "ticker", type: "bytes32", indexed: true },
      { name: "shares", type: "uint256", indexed: false },
      { name: "usdcReceived", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ReserveDeposited",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const STOCK_VAULT_ADDRESS = (process.env.NEXT_PUBLIC_STOCK_VAULT_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;
