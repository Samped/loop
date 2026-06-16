import { NextResponse } from "next/server";
import { getOracleSyncStatus, recordManualOracleSync, startOracleSyncer } from "@/lib/oracle-syncer";
import { syncPricesToContract } from "@/lib/oracle";
import { rateLimit, rateLimitJobStart, requireAdmin, sanitizeApiError } from "@/lib/api-guard";

export async function GET(req: Request) {
  const limited = rateLimitJobStart(req, "oracle-sync");
  if (limited) return limited;
  startOracleSyncer();
  return NextResponse.json(getOracleSyncStatus());
}

export async function POST(req: Request) {
  const limited = rateLimit(req, "api:oracle-sync-post", 10, 60_000);
  if (limited) return limited;
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const result = await syncPricesToContract();
    recordManualOracleSync(result);
    return NextResponse.json({ ok: true, synced: result.tickers?.length ?? 0 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: sanitizeApiError(err) }, { status: 400 });
  }
}
