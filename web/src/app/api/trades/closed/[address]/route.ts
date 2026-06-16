import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { rateLimit } from "@/lib/api-guard";
import { getClosedTradesForUser, recordClosedTrade } from "@/lib/closed-trades-store";
import { isPerpMarketTicker } from "@/lib/perp-markets";
import { isValidTickerFormat } from "@/lib/ticker-guard";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ address: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { address } = await params;
  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  try {
    const trades = await getClosedTradesForUser(address);
    return NextResponse.json({ trades });
  } catch {
    return NextResponse.json({ trades: [] });
  }
}

export async function POST(req: Request, { params }: Params) {
  const limited = rateLimit(req, "api:closed-trades-post", 40, 60_000);
  if (limited) return limited;

  const { address } = await params;
  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const tradeType = body.tradeType === "perp" ? "perp" : body.tradeType === "spot" ? "spot" : null;
  const ticker = String(body.ticker ?? "").toUpperCase();

  if (!tradeType || !isValidTickerFormat(ticker)) {
    return NextResponse.json({ error: "Invalid trade payload" }, { status: 400 });
  }
  if (tradeType === "perp" && !isPerpMarketTicker(ticker)) {
    return NextResponse.json({ error: "Invalid perp ticker" }, { status: 400 });
  }

  const bodyAddress = String(body.address ?? "").toLowerCase();
  if (bodyAddress !== address.toLowerCase()) {
    return NextResponse.json({ error: "Address mismatch" }, { status: 403 });
  }

  const trade = await recordClosedTrade({
    userAddress: address,
    tradeType,
    ticker,
    side: typeof body.side === "string" ? body.side : null,
    size: typeof body.size === "number" ? body.size : null,
    entryPrice: typeof body.entryPrice === "number" ? body.entryPrice : null,
    exitPrice: typeof body.exitPrice === "number" ? body.exitPrice : null,
    pnlUsd: typeof body.pnlUsd === "number" ? body.pnlUsd : null,
    txHash: typeof body.txHash === "string" ? body.txHash : null,
    closedAt: typeof body.closedAt === "number" ? body.closedAt : Date.now(),
  });

  if (!trade) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  return NextResponse.json({ trade });
}
