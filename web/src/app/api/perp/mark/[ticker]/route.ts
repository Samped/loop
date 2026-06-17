import { NextResponse } from "next/server";
import { synthesizeMarkCandle } from "@/lib/perp-mark-chart-server";
import {
  advancePerpMark,
  getPerpMarkCandles,
  getPerpMarkSnapshot,
  parseChartRange,
} from "@/lib/perp-mark-engine";
import { startPerpMarkEngine } from "@/lib/perp-mark-engine-runner";
import { isPerpMarketTicker } from "@/lib/perp-markets";
import { rateLimit } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ticker: string }> };

function rangeFromUrl(url: string) {
  return parseChartRange(new URL(url).searchParams.get("range"));
}

/** Read-only mark snapshot — state advances only via the internal mark engine runner. */
export async function GET(req: Request, { params }: Params) {
  const limited = rateLimit(req, "api:perp-mark-get", 900, 60_000);
  if (limited) return limited;

  const { ticker } = await params;
  const upper = ticker.toUpperCase();
  if (!isPerpMarketTicker(upper)) {
    return NextResponse.json({ error: "Unknown perp market" }, { status: 404 });
  }

  startPerpMarkEngine();

  const range = rangeFromUrl(req.url);
  let snap = getPerpMarkSnapshot(upper);
  if (!snap) {
    snap = await advancePerpMark(upper);
  }
  if (!snap) {
    return NextResponse.json({ error: "Mark unavailable" }, { status: 404 });
  }

  let candles = getPerpMarkCandles(upper, range);
  if (!candles.length && snap.price > 0) {
    candles = [synthesizeMarkCandle(snap.price, snap.updatedAt)];
  }
  return NextResponse.json(
    { ...snap, range, candles },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );
}
