import { NextResponse } from "next/server";
import { getOracleSyncStatus, startOracleSyncer } from "@/lib/oracle-syncer";
import { rateLimitJobStart } from "@/lib/api-guard";

export function GET(req: Request) {
  const limited = rateLimitJobStart(req, "oracle-status");
  if (limited) return limited;
  startOracleSyncer();
  return NextResponse.json(getOracleSyncStatus());
}
