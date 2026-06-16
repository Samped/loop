import { NextResponse } from "next/server";
import {
  buildMarketPayloadFromStore,
  hasLiveMarketApi,
  isSnapshotPrefetchActive,
  seedDemoSnapshots,
  startBackgroundMarketRefresh,
  startBackgroundSnapshotPrefetch,
} from "@/lib/market-cold-start";
import { getCachedCryptoStocks, getCachedSectors } from "@/lib/market-data";
import {
  getMarketCacheAgeMs,
  getStoredSnapshots,
  getStoredStocks,
  hasBundledMarketCatalog,
  hydrateSnapshotStore,
  setStoredSectors,
  setStoredStocks,
} from "@/lib/snapshot-store";
import { filterListedSnapshots, isStockReady } from "@/lib/stock-ready";
import { DEMO_SECTORS, DEMO_STOCKS } from "@/lib/sosovalue";
import { rateLimit } from "@/lib/api-guard";
import { withTimeout } from "@/lib/async-timeout";

export const maxDuration = 10;

function jsonBootstrap(body: Record<string, unknown>, cacheSeconds = 0) {
  const headers: Record<string, string> = {};
  if (cacheSeconds > 0) {
    headers["Cache-Control"] = `public, s-maxage=${cacheSeconds}, stale-while-revalidate=120`;
  }
  return NextResponse.json(body, { headers });
}

export async function GET(req: Request) {
  const limited = rateLimit(req, "api:bootstrap-get", 120, 60_000);
  if (limited) return limited;

  try {
    hydrateSnapshotStore();

    if (hasBundledMarketCatalog()) {
      const cacheAgeMs = getMarketCacheAgeMs();
      if (hasLiveMarketApi()) startBackgroundMarketRefresh(cacheAgeMs);

      const { allStocks, sectors, snapshots, listedStocks, marketSource } =
        buildMarketPayloadFromStore();
      const chartReady = allStocks.filter((s) => isStockReady(s.ticker)).map((s) => s.ticker);

      return jsonBootstrap(
        {
          stocks: listedStocks,
          allStocks,
          sectors,
          snapshots: filterListedSnapshots(snapshots),
          chartReady,
          marketSource,
          priceCount: listedStocks.length,
          chartCount: chartReady.length,
          priceTotal: allStocks.length,
          pricesRefreshing: isSnapshotPrefetchActive(),
        },
        60,
      );
    }

    let allStocks = getStoredStocks() ?? [];
    let sectors = getStoredSectors() ?? [];

    const refreshed = await withTimeout(
      Promise.all([getCachedCryptoStocks(), getCachedSectors()]),
      5_000,
    );
    if (refreshed) {
      if (Array.isArray(refreshed[0]?.stocks)) allStocks = refreshed[0].stocks;
      if (Array.isArray(refreshed[1]?.sectors)) sectors = refreshed[1].sectors;
    }

    if (allStocks.length === 0) {
      allStocks = DEMO_STOCKS;
      sectors = DEMO_SECTORS;
      seedDemoSnapshots(allStocks);
    } else if (hasLiveMarketApi()) {
      startBackgroundSnapshotPrefetch(allStocks, { demo: false });
    } else {
      seedDemoSnapshots(allStocks);
    }

    if (refreshed?.[0]?.stocks) setStoredStocks(allStocks);
    if (refreshed?.[1]?.sectors) setStoredSectors(sectors);

    const { listedStocks, snapshots, marketSource } = buildMarketPayloadFromStore();
    const chartReady = allStocks.filter((s) => isStockReady(s.ticker)).map((s) => s.ticker);

    return jsonBootstrap({
      stocks: listedStocks.length ? listedStocks : allStocks,
      allStocks,
      sectors,
      snapshots: filterListedSnapshots(snapshots),
      chartReady,
      marketSource: allStocks === DEMO_STOCKS ? "demo" : marketSource,
      priceCount: listedStocks.length,
      chartCount: chartReady.length,
      priceTotal: allStocks.length,
      pricesRefreshing: hasLiveMarketApi() && listedStocks.length < allStocks.length,
    });
  } catch (err) {
    console.error("[bootstrap]", err);
    seedDemoSnapshots(DEMO_STOCKS);
    return jsonBootstrap({
      stocks: DEMO_STOCKS,
      allStocks: DEMO_STOCKS,
      sectors: DEMO_SECTORS,
      snapshots: filterListedSnapshots(getStoredSnapshots()),
      chartReady: [],
      marketSource: "demo",
      priceCount: DEMO_STOCKS.length,
      chartCount: 0,
      priceTotal: DEMO_STOCKS.length,
      pricesRefreshing: false,
    });
  }
}
