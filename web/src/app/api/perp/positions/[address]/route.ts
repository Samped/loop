import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { getCachedCryptoStocks } from "@/lib/market-data";
import { getCachedPerpPositionsForAddress } from "@/lib/perp-positions-cache";
import { getStoredStocks, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { withTimeout } from "@/lib/async-timeout";

export const maxDuration = 15;

type Params = { params: Promise<{ address: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { address: raw } = await params;

  if (!isAddress(raw)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  hydrateSnapshotStore();

  let stocks = getStoredStocks() ?? [];
  if (!stocks.length) {
    try {
      const result = await withTimeout(getCachedCryptoStocks(), 2_000);
      if (result) stocks = result.stocks;
    } catch {
      return NextResponse.json({ positions: [] });
    }
  }

  try {
    const positions = await getCachedPerpPositionsForAddress(raw as `0x${string}`, stocks);
    return NextResponse.json({ positions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Perp positions fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
