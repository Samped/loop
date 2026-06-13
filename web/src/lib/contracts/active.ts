import { getStockVaultAddress } from "@/lib/config";
import { stockVaultAbi } from "@/lib/contracts/stock-vault";

/** Resolve USDC vault at runtime (client reads NEXT_PUBLIC after dev server restart). */
export function getStockContractAddress(): `0x${string}` | null {
  const vault = process.env.NEXT_PUBLIC_STOCK_VAULT_ADDRESS as `0x${string}` | undefined;
  if (vault && vault !== "0x0000000000000000000000000000000000000000") {
    return vault;
  }
  return getStockVaultAddress();
}

export function getStockContractAbi() {
  return stockVaultAbi;
}

/** @deprecated Use getStockContractAddress() for runtime resolution */
export const STOCK_CONTRACT_ADDRESS = (getStockContractAddress() ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const stockContractAbi = stockVaultAbi;
