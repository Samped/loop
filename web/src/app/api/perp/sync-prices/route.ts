import { NextResponse } from "next/server";
import { getPerpSyncStatus, startPerpOracleSyncer, syncPerpPricesNow } from "@/lib/perp-syncer";
import { startPerpMarkEngine } from "@/lib/perp-mark-engine-runner";
import { rateLimit, requireAdmin } from "@/lib/api-guard";

export async function GET() {
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
  const status = await syncPerpPricesNow(raw ? [raw] : undefined);
  return NextResponse.json(status);
}
