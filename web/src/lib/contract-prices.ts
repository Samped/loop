import { createPublicClient, http, keccak256, stringToBytes } from "viem";
import { arcTestnet } from "@/lib/arc-chain";
import { batchContractReads } from "@/lib/batch-contract-reads";
import { getStockVaultAddress } from "@/lib/config";
import { stockVaultAbi } from "@/lib/contracts/stock-vault";

const READ_BATCH = 20;

export async function getContractPrices(tickers: string[]): Promise<Record<string, bigint>> {
  const address = getStockVaultAddress();
  if (!address || tickers.length === 0) return {};

  const stockContractAbi = stockVaultAbi;

  const client = createPublicClient({ chain: arcTestnet, transport: http() });
  const prices: Record<string, bigint> = {};

  for (let i = 0; i < tickers.length; i += READ_BATCH) {
    const batch = tickers.slice(i, i + READ_BATCH);
    const items = batch.map((ticker) => ({
      address,
      abi: stockContractAbi,
      functionName: "prices" as const,
      args: [keccak256(stringToBytes(ticker))] as const,
    }));

    const results = await batchContractReads<bigint>(client, items, READ_BATCH);

    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      if (result.status === "success" && result.result > 0n) {
        prices[batch[j]] = result.result;
      }
    }
  }

  return prices;
}
