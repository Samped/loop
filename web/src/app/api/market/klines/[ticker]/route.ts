import { NextResponse } from "next/server";
import { getStoredKlines, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { getCachedKlines } from "@/lib/market-data";
import { normalizeKline } from "@/lib/sosovalue";

type Params = { params: Promise<{ ticker: string }> };

export async function GET(req: Request, { params }: Params) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 90), 500);

  hydrateSnapshotStore();

  const stored = getStoredKlines(upper);
  if (stored?.length) {
    return NextResponse.json({
      klines: stored.slice(-limit).map(normalizeKline),
      source: "cache",
    });
  }

  try {
    const { klines, stale } = await getCachedKlines(upper, limit);
    return NextResponse.json({ klines, source: "sosovalue", stale });
  } catch {
    return NextResponse.json({ error: "Chart data unavailable" }, { status: 404 });
  }
}
