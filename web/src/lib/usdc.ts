import { parseUnits, formatUnits } from "viem";

/** Arc Testnet USDC ERC-20 — use this for app transfers (6 decimals) */
export const ARC_USDC_ADDRESS =
  "0x3600000000000000000000000000000000000000" as const;

export const USDC_DECIMALS = 6;

export function parseUsdc(amount: string | number): bigint {
  return parseUnits(String(amount), USDC_DECIMALS);
}

export function formatUsdc(amount: bigint): string {
  return formatUnits(amount, USDC_DECIMALS);
}

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const;
