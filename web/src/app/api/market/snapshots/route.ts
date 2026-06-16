import { NextResponse } from "next/server";
import { getCached, getStale } from "@/lib/market-cache";
import { getCachedCryptoStocks } from "@/lib/market-data";
import { mergePriceSources } from "@/lib/snapshot-utils";
import { getStoredSnapshots, getStoredStocks, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { isSnapshotWarmerActive, startSnapshotWarmer } from "@/lib/snapshot-warmer";
import type { MarketSnapshot } from "@/lib/sosovalue";
import { DEMO_STOCKS } from "@/lib/sosovalue";

export async function GET() {
  hydrateSnapshotStore();
  startSnapshotWarmer();
  void getCachedCryptoStocks().catch(() => {});

  const stocks = getStoredStocks() ?? DEMO_STOCKS;
  const tickers = stocks.map((s) => s.ticker);
  const cached = getStoredSnapshots();

  for (const ticker of tickers) {
    const mem = getCached<MarketSnapshot>(`snapshot:${ticker}`) ?? getStale<MarketSnapshot>(`snapshot:${ticker}`);
    if (mem) cached[ticker] = mem;
  }

  const snapshots = mergePriceSources(tickers, cached, {});

  return NextResponse.json({
    snapshots,
    count: Object.keys(snapshots).length,
    total: tickers.length,
    refreshing: isSnapshotWarmerActive(),
    source: Object.keys(cached).length > 0 ? "cache" : "none",
  });
}
