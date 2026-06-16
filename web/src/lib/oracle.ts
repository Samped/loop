import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "@/lib/arc-chain";
import { getStockVaultAddress } from "@/lib/config";
import { getOraclePrivateKey } from "@/lib/config-secrets";
import { stockVaultAbi } from "@/lib/contracts/stock-vault";
import { getCachedCryptoStocks, getCachedMarketSnapshot } from "@/lib/market-data";
import { bulkSetStoredSnapshots, getStoredSnapshot } from "@/lib/snapshot-store";
import { DEMO_SNAPSHOTS, DEMO_STOCKS } from "@/lib/sosovalue";
import { parseUsdc } from "@/lib/usdc";

export type SyncResult = {
  tickers: string[];
  prices: string[];
  txHash?: string;
  source: string;
};

export async function syncPricesToContract(maxStocks = 200): Promise<SyncResult> {
  const contractAddress = getStockVaultAddress();
  const privateKey = getOraclePrivateKey();

  if (!contractAddress) {
    throw new Error("STOCK_VAULT_ADDRESS or NEXT_PUBLIC_STOCK_VAULT_ADDRESS is not set");
  }
  if (!privateKey) {
    throw new Error("ORACLE_PRIVATE_KEY or PRIVATE_KEY is not set");
  }

  let stocks;
  let source = "sosovalue";
  try {
    ({ stocks } = await getCachedCryptoStocks());
  } catch {
    stocks = DEMO_STOCKS;
    source = "demo";
  }

  const tickers: string[] = [];
  const prices: bigint[] = [];
  const snapshotsToStore: Record<string, import("@/lib/sosovalue").MarketSnapshot> = {};

  for (const stock of stocks.slice(0, maxStocks)) {
    let price: number;
    const stored = getStoredSnapshot(stock.ticker);
    if (stored) {
      price = stored.mkt_price;
      snapshotsToStore[stock.ticker] = stored;
    } else {
      try {
        const { snapshot } = await getCachedMarketSnapshot(stock.ticker);
        price = snapshot.mkt_price;
        snapshotsToStore[stock.ticker] = snapshot;
      } catch {
        const demo = DEMO_SNAPSHOTS[stock.ticker];
        if (!demo) continue;
        price = demo.mkt_price;
        source = "demo";
      }
    }
    tickers.push(stock.ticker);
    prices.push(parseUsdc(price));
  }

  if (tickers.length === 0) {
    throw new Error("No prices fetched to sync");
  }

  bulkSetStoredSnapshots(snapshotsToStore);

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(),
  });

  const BATCH = 50;
  let lastTxHash: `0x${string}` | undefined;

  for (let i = 0; i < tickers.length; i += BATCH) {
    const batchTickers = tickers.slice(i, i + BATCH);
    const batchPrices = prices.slice(i, i + BATCH);

    const { request } = await publicClient.simulateContract({
      address: contractAddress,
      abi: stockVaultAbi,
      functionName: "setPrices",
      args: [batchTickers, batchPrices],
      account: account.address,
    });

    lastTxHash = await walletClient.writeContract({
      ...request,
      account,
      chain: arcTestnet,
    });
  }

  return {
    tickers,
    prices: prices.map((p) => p.toString()),
    txHash: lastTxHash,
    source,
  };
}
