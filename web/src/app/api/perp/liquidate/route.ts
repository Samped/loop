import { NextResponse } from "next/server";
import { syncPerpMarkPricesAndLiquidate } from "@/lib/perp-oracle";
import { liquidateUnderwaterPositions } from "@/lib/perp-liquidator";
import { PERP_MARKET_TICKERS, filterPerpMarketTickers } from "@/lib/perp-markets";
import { rateLimit, requireAdmin } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

/** Force oracle catch-up + permissionless liquidation scan (server wallet). */
export async function POST(req: Request) {
  const limited = rateLimit(req, "api:perp-liquidate-post", 20, 60_000);
  if (limited) return limited;
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const requested =
    Array.isArray(body.tickers) && body.tickers.length
      ? filterPerpMarketTickers(body.tickers as string[])
      : [...PERP_MARKET_TICKERS];

  if (Array.isArray(body.tickers) && body.tickers.length && !requested.length) {
    return NextResponse.json({ error: "No valid perp tickers" }, { status: 400 });
  }

  const sync = await syncPerpMarkPricesAndLiquidate(requested);
  const liquidation = await liquidateUnderwaterPositions(requested);

  return NextResponse.json({ sync, liquidation });
}
