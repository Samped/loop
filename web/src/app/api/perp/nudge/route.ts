import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/api-guard";
import { isPerpMarketTicker } from "@/lib/perp-markets";
import { startPerpOracleSyncer, syncPerpPricesNow } from "@/lib/perp-syncer";
import { startPerpMarkEngine } from "@/lib/perp-mark-engine-runner";

export const dynamic = "force-dynamic";

/** Rate-limited public nudge — syncs perp oracle marks (and attempts liquidation) for one market. */
export async function POST(req: Request) {
  const limited = rateLimit(req, "api:perp-nudge-post", 20, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const ticker = String(body.ticker ?? "").toUpperCase();
  if (!isPerpMarketTicker(ticker)) {
    return NextResponse.json({ error: "Invalid perp ticker" }, { status: 400 });
  }

  startPerpMarkEngine();
  startPerpOracleSyncer();
  const status = await syncPerpPricesNow([ticker]);
  return NextResponse.json({ ok: true, ticker, status });
}
