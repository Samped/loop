import { NextResponse } from "next/server";
import { getCachedCryptoStocks } from "@/lib/market-data";
import {
  ensureInitialSnapshots,
  hasLiveMarketApi,
  isSnapshotPrefetchActive,
  isVercelServerless,
  startBackgroundSnapshotPrefetch,
} from "@/lib/market-cold-start";
import { getStoredSnapshots, getStoredStocks, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { isSnapshotWarmerActive, startSnapshotWarmer } from "@/lib/snapshot-warmer";
import { mergePriceSources } from "@/lib/snapshot-utils";
import { withTimeout } from "@/lib/async-timeout";
import { DEMO_STOCKS } from "@/lib/sosovalue";

export const maxDuration = 25;

export async function GET() {
  hydrateSnapshotStore();
  startSnapshotWarmer();

  let stocks = getStoredStocks() ?? (hasLiveMarketApi() ? [] : DEMO_STOCKS);
  try {
    const refreshed = await withTimeout(getCachedCryptoStocks(), 6_000);
    if (refreshed) stocks = refreshed.stocks;
  } catch {
    // keep stored or demo
  }

  const prefetchOptions = { demo: !hasLiveMarketApi() };
  if (isVercelServerless) {
    startBackgroundSnapshotPrefetch(stocks, prefetchOptions);
  } else {
    await ensureInitialSnapshots(stocks, prefetchOptions);
  }

  const tickers = stocks.map((s) => s.ticker);
  const cached = getStoredSnapshots();
  const snapshots = mergePriceSources(tickers, cached, {});

  return NextResponse.json({
    snapshots,
    count: Object.keys(snapshots).length,
    total: tickers.length,
    refreshing:
      Object.keys(snapshots).length < tickers.length ||
      isSnapshotPrefetchActive() ||
      isSnapshotWarmerActive(),
    source: hasLiveMarketApi() ? "live" : "demo",
  });
}
