import { NextResponse } from "next/server";
import { getPerpSyncStatus, startPerpOracleSyncer, syncPerpPricesNow } from "@/lib/perp-syncer";
import { startPerpMarkEngine } from "@/lib/perp-mark-engine-runner";
import { rateLimit, rateLimitJobStart, requireAdmin } from "@/lib/api-guard";
import { isPerpMarketTicker } from "@/lib/perp-markets";

export async function GET(req: Request) {
  const limited = rateLimitJobStart(req, "perp-sync");
  if (limited) return limited;
  startPerpMarkEngine();
  startPerpOracleSyncer();
  return NextResponse.json(getPerpSyncStatus());
}

export async function POST(req: Request) {
  const limited = rateLimit(req, "api:perp-sync-post", 20, 60_000);
  if (limited) return limited;
  const denied = requireAdmin(req);
  if (denied) return denied;

  startPerpMarkEngine();
  startPerpOracleSyncer();
  const body = await req.json().catch(() => ({}));
  const raw = typeof body.ticker === "string" ? body.ticker.toUpperCase() : undefined;
  if (raw && !isPerpMarketTicker(raw)) {
    return NextResponse.json({ error: "Invalid perp ticker" }, { status: 400 });
  }
  const status = await syncPerpPricesNow(raw ? [raw] : undefined);
  return NextResponse.json(status);
}
