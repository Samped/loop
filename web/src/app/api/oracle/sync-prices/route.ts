import { NextResponse } from "next/server";
import { getOracleSyncStatus, recordManualOracleSync, startOracleSyncer } from "@/lib/oracle-syncer";
import { syncPricesToContract } from "@/lib/oracle";
import { rateLimit, requireAdmin } from "@/lib/api-guard";

export async function GET() {
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
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Price sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
