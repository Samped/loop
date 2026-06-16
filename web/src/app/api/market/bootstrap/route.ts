import { NextResponse } from "next/server";
import { getCachedCryptoStocks, getCachedSectors } from "@/lib/market-data";
import {
  hasLiveMarketApi,
  isSnapshotPrefetchActive,
  isVercelServerless,
  seedDemoSnapshots,
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
import { filterListedSnapshots, isStockListed, isStockReady } from "@/lib/stock-ready";
import { DEMO_SECTORS, DEMO_STOCKS, getCryptoStocks, getSectors, type CryptoStock, type Sector } from "@/lib/sosovalue";
import { rateLimit } from "@/lib/api-guard";
import { withTimeout } from "@/lib/async-timeout";

const CATALOG_TIMEOUT_MS = 6_000;

export const maxDuration = 25;

function demoBootstrap() {
  seedDemoSnapshots(DEMO_STOCKS);
  const snapshots = filterListedSnapshots(getStoredSnapshots());
  const listed = DEMO_STOCKS.filter((s) => isStockListed(s.ticker));
  return NextResponse.json({
    stocks: listed,
    allStocks: DEMO_STOCKS,
    sectors: DEMO_SECTORS,
    snapshots,
    chartReady: [],
    marketSource: "demo",
    priceCount: listed.length,
    chartCount: 0,
    priceTotal: DEMO_STOCKS.length,
    pricesRefreshing: false,
  });
}

export async function GET(req: Request) {
  const limited = rateLimit(req, "api:bootstrap-get", 120, 60_000);
  if (limited) return limited;

  try {
    hydrateSnapshotStore();

    let allStocks: CryptoStock[] = getStoredStocks() ?? [];
    let sectors: Sector[] = getStoredSectors() ?? [];
    let marketSource = hasLiveMarketApi() ? "sosovalue" : "demo";

    const refreshed = await withTimeout(
      Promise.all([getCachedCryptoStocks(), getCachedSectors()]),
      CATALOG_TIMEOUT_MS,
    );
    if (refreshed) {
      if (Array.isArray(refreshed[0]?.stocks)) allStocks = refreshed[0].stocks;
      if (Array.isArray(refreshed[1]?.sectors)) sectors = refreshed[1].sectors;
    }

    if (hasLiveMarketApi() && allStocks.length <= DEMO_STOCKS.length) {
      const direct = await withTimeout(Promise.all([getCryptoStocks(), getSectors()]), 5_000);
      if (direct) {
        const [liveStocks, liveSectors] = direct;
        if (Array.isArray(liveStocks) && liveStocks.length > allStocks.length) {
          allStocks = liveStocks;
          setStoredStocks(liveStocks);
        }
        if (Array.isArray(liveSectors) && liveSectors.length > 0) {
          sectors = liveSectors;
          setStoredSectors(liveSectors);
        }
      }
    }

    if (allStocks.length === 0) {
      return demoBootstrap();
    }

    if (!hasLiveMarketApi()) {
      seedDemoSnapshots(allStocks);
      marketSource = "demo";
    } else {
      startBackgroundSnapshotPrefetch(allStocks, { demo: false });
    }

    const snapshots = filterListedSnapshots(getStoredSnapshots());
    const listedStocks = allStocks.filter((s) => isStockListed(s.ticker));
    const chartReady = allStocks.filter((s) => isStockReady(s.ticker)).map((s) => s.ticker);
    const pricesRefreshing = hasLiveMarketApi() && listedStocks.length < allStocks.length;

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
  } catch (err) {
    console.error("[bootstrap]", err);
    return demoBootstrap();
  }
}
