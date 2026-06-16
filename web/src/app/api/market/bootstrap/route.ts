import { NextResponse } from "next/server";
import { getCachedCryptoStocks, getCachedSectors } from "@/lib/market-data";
import { ensureInitialSnapshots, isVercelServerless } from "@/lib/market-cold-start";
import { getStoredSectors, getStoredSnapshots, getStoredStocks, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { isSnapshotWarmerActive, startSnapshotWarmer } from "@/lib/snapshot-warmer";
import { startOracleSyncer } from "@/lib/oracle-syncer";
import { startNewsSyncer } from "@/lib/news-syncer";
import { filterListedSnapshots, isStockListed, isStockReady } from "@/lib/stock-ready";
import { DEMO_SECTORS, DEMO_STOCKS } from "@/lib/sosovalue";
import { rateLimit } from "@/lib/api-guard";
import { withTimeout } from "@/lib/async-timeout";

const LIVE_REFRESH_MS = 5_000;

export const maxDuration = 15;

export async function GET(req: Request) {
  const limited = rateLimit(req, "api:bootstrap-get", 120, 60_000);
  if (limited) return limited;

  hydrateSnapshotStore();
  if (!isVercelServerless) {
    startSnapshotWarmer();
  }
  startOracleSyncer();
  startNewsSyncer();

  let allStocks = getStoredStocks() ?? DEMO_STOCKS;
  let sectors = getStoredSectors() ?? DEMO_SECTORS;
  let marketSource = allStocks.length === DEMO_STOCKS.length ? "demo" : "sosovalue";

  try {
    const refreshed = await withTimeout(
      Promise.all([getCachedCryptoStocks(), getCachedSectors()]),
      LIVE_REFRESH_MS,
    );
    if (refreshed) {
      allStocks = refreshed[0].stocks;
      sectors = refreshed[1].sectors;
      marketSource = "sosovalue";
    }
  } catch {
    if (allStocks === DEMO_STOCKS) marketSource = "demo";
  }

  await ensureInitialSnapshots(allStocks, { demo: marketSource === "demo" });

  const snapshots = filterListedSnapshots(getStoredSnapshots());
  const listedStocks = allStocks.filter((s) => isStockListed(s.ticker));
  const chartReady = allStocks.filter((s) => isStockReady(s.ticker)).map((s) => s.ticker);

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
    pricesRefreshing: !isVercelServerless && isSnapshotWarmerActive(),
  });
}
