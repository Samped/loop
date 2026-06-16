import { NextResponse } from "next/server";
import {
  getPerpMarkCandles,
  getPerpMarkSnapshot,
  parseChartRange,
} from "@/lib/perp-mark-engine";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ticker: string }> };

function rangeFromUrl(url: string) {
  return parseChartRange(new URL(url).searchParams.get("range"));
}

export async function GET(req: Request, { params }: Params) {
  const { ticker } = await params;
  const range = rangeFromUrl(req.url);
  const snap = await getPerpMarkSnapshot(ticker);
  if (!snap) {
    return NextResponse.json({ error: "Mark unavailable" }, { status: 404 });
  }
  const candles = getPerpMarkCandles(ticker, range);
  return NextResponse.json(
    { ...snap, range, candles },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );
}
