import { NextResponse } from "next/server";
import { getCachedCryptoStocks } from "@/lib/market-data";
import { getStoredStocks, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { DEMO_STOCKS } from "@/lib/sosovalue";

export async function GET() {
  hydrateSnapshotStore();
  const stored = getStoredStocks();
  void getCachedCryptoStocks().catch(() => {});

  const stocks = stored?.length ? stored : DEMO_STOCKS;
  return NextResponse.json({
    stocks,
    source: stored?.length ? "cache" : "demo",
    stale: !stored?.length,
  });
}
