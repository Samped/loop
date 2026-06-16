import { NextResponse } from "next/server";
import { getCachedCryptoStocks } from "@/lib/market-data";
import { hasLiveMarketApi } from "@/lib/market-cold-start";
import { getStoredStocks, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { withTimeout } from "@/lib/async-timeout";
import { DEMO_STOCKS } from "@/lib/sosovalue";

export const maxDuration = 15;

export async function GET() {
  hydrateSnapshotStore();

  let stocks = getStoredStocks();
  let source = stocks?.length ? "cache" : "demo";
  let stale = false;

  try {
    const refreshed = await withTimeout(getCachedCryptoStocks(), 6_000);
    if (refreshed) {
      stocks = refreshed.stocks;
      source = "live";
      stale = refreshed.stale;
    }
  } catch {
    if (!stocks?.length) stocks = DEMO_STOCKS;
  }

  return NextResponse.json({
    stocks: stocks ?? DEMO_STOCKS,
    source: hasLiveMarketApi() ? source : "demo",
    stale,
  });
}
