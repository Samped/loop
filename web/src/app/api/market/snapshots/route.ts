import { NextResponse } from "next/server";
import { buildMarketPayloadFromStore, hasLiveMarketApi, seedDemoSnapshots } from "@/lib/market-cold-start";
import { getStoredSnapshots, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { filterListedSnapshots } from "@/lib/stock-ready";
import { DEMO_STOCKS } from "@/lib/sosovalue";

export const maxDuration = 10;

export async function GET() {
  try {
    hydrateSnapshotStore();
    const { allStocks, snapshots } = buildMarketPayloadFromStore();
    const tickers = allStocks.length ? allStocks.map((s) => s.ticker) : DEMO_STOCKS.map((s) => s.ticker);
    const merged = filterListedSnapshots(snapshots);
    const count = Object.keys(merged).length;

    return NextResponse.json({
      snapshots: merged,
      count,
      total: tickers.length,
      refreshing: false,
      source: hasLiveMarketApi() ? "live" : "cache",
    });
  } catch (err) {
    console.error("[snapshots]", err);
    seedDemoSnapshots(DEMO_STOCKS);
    const snapshots = filterListedSnapshots(getStoredSnapshots());
    return NextResponse.json({
      snapshots,
      count: Object.keys(snapshots).length,
      total: DEMO_STOCKS.length,
      refreshing: false,
      source: "demo",
    });
  }
}
