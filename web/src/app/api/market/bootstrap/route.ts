import { NextResponse } from "next/server";
import { getCachedCryptoStocks, getCachedSectors } from "@/lib/market-data";
import { getStoredSectors, getStoredSnapshots, getStoredStocks, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { isSnapshotWarmerActive, startSnapshotWarmer } from "@/lib/snapshot-warmer";
import { startOracleSyncer } from "@/lib/oracle-syncer";
import { startNewsSyncer } from "@/lib/news-syncer";
import { filterListedSnapshots, isStockListed, isStockReady } from "@/lib/stock-ready";
import { DEMO_SECTORS, DEMO_STOCKS } from "@/lib/sosovalue";

export async function GET() {
  hydrateSnapshotStore();
  startSnapshotWarmer();
  startOracleSyncer();
  startNewsSyncer();

  let allStocks = getStoredStocks() ?? DEMO_STOCKS;
  let sectors = getStoredSectors() ?? DEMO_SECTORS;
  let marketSource = allStocks.length === DEMO_STOCKS.length ? "demo" : "sosovalue";

  try {
    const [stocksResult, sectorsResult] = await Promise.all([
      getCachedCryptoStocks(),
      getCachedSectors(),
    ]);
    allStocks = stocksResult.stocks;
    sectors = sectorsResult.sectors;
    marketSource = "sosovalue";
  } catch {
    if (allStocks === DEMO_STOCKS) marketSource = "demo";
  }

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
    pricesRefreshing: isSnapshotWarmerActive(),
  });
}
