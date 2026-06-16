import { NextResponse } from "next/server";
import { getCachedCryptoStocks } from "@/lib/market-data";
import {
  hasLiveMarketApi,
  isSnapshotPrefetchActive,
  isVercelServerless,
  seedDemoSnapshots,
  startBackgroundSnapshotPrefetch,
} from "@/lib/market-cold-start";
import { getStoredSnapshots, getStoredStocks, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { mergePriceSources } from "@/lib/snapshot-utils";
import { withTimeout } from "@/lib/async-timeout";
import { DEMO_STOCKS } from "@/lib/sosovalue";

export const maxDuration = 25;

export async function GET() {
  try {
    hydrateSnapshotStore();

    let stocks = getStoredStocks() ?? [];
    try {
      const refreshed = await withTimeout(getCachedCryptoStocks(), 4_000);
      if (refreshed?.stocks?.length) stocks = refreshed.stocks;
    } catch {
      // use stored
    }

    if (stocks.length === 0) {
      stocks = hasLiveMarketApi() ? [] : DEMO_STOCKS;
    }

    if (!hasLiveMarketApi()) {
      seedDemoSnapshots(stocks);
    } else if (stocks.length > 0) {
      startBackgroundSnapshotPrefetch(stocks, { demo: false });
    }

    const tickers = stocks.map((s) => s.ticker);
    const cached = getStoredSnapshots();
    const snapshots = mergePriceSources(tickers, cached, {});
    const count = Object.keys(snapshots).length;
    const refreshing = hasLiveMarketApi() && stocks.length > 0 && count < stocks.length;

    return NextResponse.json({
      snapshots,
      count,
      total: tickers.length,
      refreshing,
      source: hasLiveMarketApi() ? "live" : "demo",
    });
  } catch (err) {
    console.error("[snapshots]", err);
    seedDemoSnapshots(DEMO_STOCKS);
    const snapshots = mergePriceSources(
      DEMO_STOCKS.map((s) => s.ticker),
      getStoredSnapshots(),
      {},
    );
    return NextResponse.json({
      snapshots,
      count: Object.keys(snapshots).length,
      total: DEMO_STOCKS.length,
      refreshing: false,
      source: "demo",
    });
  }
}
