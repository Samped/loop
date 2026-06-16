import { NextResponse } from "next/server";
import { getCachedCryptoStocks } from "@/lib/market-data";
import { ensureInitialSnapshots, hasLiveMarketApi, isVercelServerless } from "@/lib/market-cold-start";
import { getStoredSnapshots, getStoredStocks, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { isSnapshotWarmerActive, startSnapshotWarmer } from "@/lib/snapshot-warmer";
import { mergePriceSources } from "@/lib/snapshot-utils";
import { withTimeout } from "@/lib/async-timeout";
import { DEMO_STOCKS } from "@/lib/sosovalue";

export const maxDuration = 25;

export async function GET() {
  hydrateSnapshotStore();
  if (!isVercelServerless) {
    startSnapshotWarmer();
  }

  let stocks = getStoredStocks() ?? DEMO_STOCKS;
  try {
    const refreshed = await withTimeout(getCachedCryptoStocks(), 6_000);
    if (refreshed) stocks = refreshed.stocks;
  } catch {
    // keep stored or demo
  }

  await ensureInitialSnapshots(stocks, { demo: !hasLiveMarketApi() });

  const tickers = stocks.map((s) => s.ticker);
  const cached = getStoredSnapshots();
  const snapshots = mergePriceSources(tickers, cached, {});

  return NextResponse.json({
    snapshots,
    count: Object.keys(snapshots).length,
    total: tickers.length,
    refreshing: !isVercelServerless && isSnapshotWarmerActive(),
    source: hasLiveMarketApi() ? "live" : "demo",
  });
}
