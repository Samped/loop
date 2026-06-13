import { NextResponse } from "next/server";
import { getOracleSyncStatus, recordManualOracleSync, startOracleSyncer } from "@/lib/oracle-syncer";
import { syncPricesToContract } from "@/lib/oracle";

export async function GET() {
  startOracleSyncer();
  return NextResponse.json(getOracleSyncStatus());
}

export async function POST() {
  try {
    const result = await syncPricesToContract();
    recordManualOracleSync(result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Price sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
