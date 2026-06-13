import { NextResponse } from "next/server";
import { getCachedMarketSnapshot } from "@/lib/market-data";
import type { MarketSnapshot } from "@/lib/sosovalue";
import { BATCH_DELAY_MS, SNAPSHOT_BATCH } from "@/lib/market-config";

const RATE_LIMIT_MS = BATCH_DELAY_MS + 100;
const MAX_PER_REQUEST = SNAPSHOT_BATCH;

export async function POST(req: Request) {
  let body: { tickers?: string[] };
  try {
    body = (await req.json()) as { tickers?: string[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { tickers } = body;
  if (!tickers?.length) {
    return NextResponse.json({ error: "tickers array required" }, { status: 400 });
  }

  const limited = tickers.slice(0, MAX_PER_REQUEST).map((t) => t.toUpperCase());
  const snapshots: Record<string, MarketSnapshot> = {};
  const errors: string[] = [];
  let pendingDelay = false;

  for (const ticker of limited) {
    if (pendingDelay) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }

    try {
      const { snapshot, fromCache } = await getCachedMarketSnapshot(ticker);
      snapshots[ticker] = snapshot;
      pendingDelay = !fromCache;
    } catch {
      errors.push(ticker);
      pendingDelay = true;
    }
  }

  return NextResponse.json({
    snapshots,
    fetched: Object.keys(snapshots).length,
    failed: errors,
    source: "sosovalue",
  });
}
