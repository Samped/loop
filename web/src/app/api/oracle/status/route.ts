import { NextResponse } from "next/server";
import { getOracleSyncStatus, startOracleSyncer } from "@/lib/oracle-syncer";

export function GET() {
  startOracleSyncer();
  return NextResponse.json(getOracleSyncStatus());
}
