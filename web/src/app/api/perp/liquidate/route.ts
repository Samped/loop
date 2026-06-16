import { NextResponse } from "next/server";
import { syncPerpMarkPricesAndLiquidate } from "@/lib/perp-oracle";
import { liquidateUnderwaterPositions } from "@/lib/perp-liquidator";
import { PERP_MARKET_TICKERS } from "@/lib/perp-markets";
import { rateLimit, requireAdmin } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

/** Force oracle catch-up + permissionless liquidation scan (server wallet). */
export async function POST(req: Request) {
  const limited = rateLimit(req, "api:perp-liquidate-post", 20, 60_000);
  if (limited) return limited;
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const tickers =
    Array.isArray(body.tickers) && body.tickers.length
      ? (body.tickers as string[]).map((t) => t.toUpperCase())
      : [...PERP_MARKET_TICKERS];

  const sync = await syncPerpMarkPricesAndLiquidate(tickers);
  const liquidation = await liquidateUnderwaterPositions(tickers);

  return NextResponse.json({ sync, liquidation });
}
