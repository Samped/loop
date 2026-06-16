import { NextResponse } from "next/server";
import { rateLimit, sanitizeApiError } from "@/lib/api-guard";
import { syncPricesToContract } from "@/lib/oracle";
import { recordManualOracleSync, startOracleSyncer } from "@/lib/oracle-syncer";

export const dynamic = "force-dynamic";

/** Rate-limited public nudge — pushes spot vault prices on-chain once. */
export async function POST(req: Request) {
  const limited = rateLimit(req, "api:oracle-nudge-post", 6, 60_000);
  if (limited) return limited;

  startOracleSyncer();
  try {
    const result = await syncPricesToContract();
    recordManualOracleSync(result);
    return NextResponse.json({ ok: true, synced: result.tickers?.length ?? 0 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: sanitizeApiError(err) }, { status: 400 });
  }
}
