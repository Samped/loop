import { NextResponse } from "next/server";
import { getCached, getStale } from "@/lib/market-cache";
import { getContractPrices } from "@/lib/contract-prices";
import { getCachedCryptoStocks } from "@/lib/market-data";
import { mergePriceSources } from "@/lib/snapshot-utils";
import { getStoredSnapshots, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { isSnapshotWarmerActive, startSnapshotWarmer } from "@/lib/snapshot-warmer";
import type { MarketSnapshot } from "@/lib/sosovalue";

export async function GET() {
  hydrateSnapshotStore();
  startSnapshotWarmer();

  const { stocks } = await getCachedCryptoStocks();
  const tickers = stocks.map((s) => s.ticker);
  const cached = getStoredSnapshots();

  for (const ticker of tickers) {
    const mem = getCached<MarketSnapshot>(`snapshot:${ticker}`) ?? getStale<MarketSnapshot>(`snapshot:${ticker}`);
    if (mem) cached[ticker] = mem;
  }

  let contractPrices: Record<string, bigint> = {};
  try {
    contractPrices = await getContractPrices(tickers);
  } catch {
    contractPrices = {};
  }

  const snapshots = mergePriceSources(tickers, cached, contractPrices);

  return NextResponse.json({
    snapshots,
    count: Object.keys(snapshots).length,
    total: tickers.length,
    refreshing: isSnapshotWarmerActive(),
    source: Object.keys(cached).length > 0 ? "cache" : Object.keys(contractPrices).length > 0 ? "contract" : "none",
  });
}
