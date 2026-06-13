import { NextResponse } from "next/server";
import { getStockVaultAddress } from "@/lib/config";

/** Server-resolved USDC vault address — avoids stale Turbopack-inlined NEXT_PUBLIC env on the client. */
export function GET() {
  const address = getStockVaultAddress();

  return NextResponse.json({
    address,
    vaultMode: Boolean(address),
  });
}
