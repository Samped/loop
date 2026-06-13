import { NextResponse } from "next/server";
import { getStoredSnapshot, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { getCachedMarketSnapshot } from "@/lib/market-data";
import { isStockReady } from "@/lib/stock-ready";

type Params = { params: Promise<{ ticker: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  hydrateSnapshotStore();

  const stored = getStoredSnapshot(upper);
  if (stored && isStockReady(upper)) {
    return NextResponse.json({ snapshot: stored, source: "sosovalue" });
  }

  try {
    const { snapshot, stale } = await getCachedMarketSnapshot(upper);
    if (!isStockReady(upper)) {
      return NextResponse.json({ error: "Snapshot not ready" }, { status: 404 });
    }
    return NextResponse.json({ snapshot, source: "sosovalue", stale });
  } catch {
    return NextResponse.json({ error: "Ticker not found" }, { status: 404 });
  }
}
