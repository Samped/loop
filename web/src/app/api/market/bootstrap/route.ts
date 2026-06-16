import { NextResponse } from "next/server";
import { getCachedCryptoStocks, getCachedSectors } from "@/lib/market-data";
import {
  ensureInitialSnapshots,
  hasLiveMarketApi,
  isSnapshotPrefetchActive,
  isVercelServerless,
  startBackgroundSnapshotPrefetch,
} from "@/lib/market-cold-start";
import {
  getStoredSectors,
  getStoredSnapshots,
  getStoredStocks,
  hydrateSnapshotStore,
  setStoredSectors,
  setStoredStocks,
} from "@/lib/snapshot-store";
import { isSnapshotWarmerActive, startSnapshotWarmer } from "@/lib/snapshot-warmer";
import { startOracleSyncer } from "@/lib/oracle-syncer";
import { startNewsSyncer } from "@/lib/news-syncer";
import { filterListedSnapshots, isStockListed, isStockReady } from "@/lib/stock-ready";
import { DEMO_SECTORS, DEMO_STOCKS, getCryptoStocks, getSectors } from "@/lib/sosovalue";
import { rateLimit } from "@/lib/api-guard";
import { withTimeout } from "@/lib/async-timeout";

const LIVE_REFRESH_MS = isVercelServerless ? 10_000 : 8_000;

export const maxDuration = 25;

export async function GET(req: Request) {
  const limited = rateLimit(req, "api:bootstrap-get", 120, 60_000);
  if (limited) return limited;

  hydrateSnapshotStore();
  startSnapshotWarmer();
  startOracleSyncer();
  startNewsSyncer();

  let allStocks = getStoredStocks() ?? (hasLiveMarketApi() ? [] : DEMO_STOCKS);
  let sectors = getStoredSectors() ?? (hasLiveMarketApi() ? [] : DEMO_SECTORS);
  let marketSource = hasLiveMarketApi() ? "sosovalue" : "demo";

  try {
    const refreshed = await withTimeout(
      Promise.all([getCachedCryptoStocks(), getCachedSectors()]),
      LIVE_REFRESH_MS,
    );
    if (refreshed) {
      allStocks = refreshed[0].stocks;
      sectors = refreshed[1].sectors;
    }
  } catch {
    if (!hasLiveMarketApi()) marketSource = "demo";
  }

  if (hasLiveMarketApi() && allStocks.length <= DEMO_STOCKS.length) {
    const direct = await withTimeout(Promise.all([getCryptoStocks(), getSectors()]), 8_000);
    if (direct) {
      const [liveStocks, liveSectors] = direct;
      if (liveStocks.length > allStocks.length) {
        allStocks = liveStocks;
        setStoredStocks(liveStocks);
      }
      if (liveSectors.length > 0) {
        sectors = liveSectors;
        setStoredSectors(liveSectors);
      }
    }
  }

  if (!hasLiveMarketApi() && allStocks.length === 0) {
    allStocks = DEMO_STOCKS;
    sectors = DEMO_SECTORS;
    marketSource = "demo";
  }

  const prefetchOptions = { demo: !hasLiveMarketApi() };
  if (isVercelServerless) {
    startBackgroundSnapshotPrefetch(allStocks, prefetchOptions);
  } else {
    await ensureInitialSnapshots(allStocks, prefetchOptions);
  }

  const snapshots = filterListedSnapshots(getStoredSnapshots());
  const listedStocks = allStocks.filter((s) => isStockListed(s.ticker));
  const chartReady = allStocks.filter((s) => isStockReady(s.ticker)).map((s) => s.ticker);
  const pricesRefreshing =
    listedStocks.length < allStocks.length ||
    isSnapshotPrefetchActive() ||
    isSnapshotWarmerActive();

  return NextResponse.json({
    stocks: listedStocks,
    allStocks,
    sectors,
    snapshots,
    chartReady,
    marketSource,
    priceCount: listedStocks.length,
    chartCount: chartReady.length,
    priceTotal: allStocks.length,
    pricesRefreshing,
  });
}
