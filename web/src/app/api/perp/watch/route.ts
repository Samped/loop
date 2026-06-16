import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { registerPerpTrader, unregisterPerpTrader } from "@/lib/perp-trader-registry";
import { syncPerpPricesNow } from "@/lib/perp-syncer";
import { rateLimit } from "@/lib/api-guard";
import { isPerpMarketTicker } from "@/lib/perp-markets";

export async function POST(req: Request) {
  const limited = rateLimit(req, "api:perp-watch-post", 120, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const address = String(body.address ?? "");
  const ticker = String(body.ticker ?? "").toUpperCase();
  const open = body.open !== false;

  if (!isAddress(address) || !isPerpMarketTicker(ticker)) {
    return NextResponse.json({ error: "Invalid address or perp ticker" }, { status: 400 });
  }

  if (open) {
    registerPerpTrader(ticker, address);
    void syncPerpPricesNow([ticker]);
  } else {
    unregisterPerpTrader(ticker, address);
  }

  return NextResponse.json({ ok: true, ticker, address, open });
}
