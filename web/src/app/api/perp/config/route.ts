import { NextResponse } from "next/server";
import { getPerpEngineAddress } from "@/lib/config";
import { getPerpMarkEngineMode } from "@/lib/perp-mark-config";
import { getPerpMarkEngineStatus } from "@/lib/perp-mark-engine-runner";
import { getPerpFundingStatus } from "@/lib/perp-funding-syncer";
import { getPerpSyncStatus } from "@/lib/perp-syncer";
import { getUsMarketSessionLabel } from "@/lib/us-market-hours";

export function GET() {
  const address = getPerpEngineAddress();
  return NextResponse.json({
    address,
    perpMode: Boolean(address),
    markEngine: getPerpMarkEngineStatus(),
    oracleSync: getPerpSyncStatus(),
    fundingSync: getPerpFundingStatus(),
    markMode: getPerpMarkEngineMode(),
    marketSession: getUsMarketSessionLabel(),
  });
}
