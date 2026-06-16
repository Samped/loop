import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { getCachedCryptoStocks } from "@/lib/market-data";
import { getPerpPositionsForAddress } from "@/lib/portfolio";
import { getStoredStocks, hydrateSnapshotStore } from "@/lib/snapshot-store";

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
      const result = await getCachedCryptoStocks();
      stocks = result.stocks;
    } catch {
      return NextResponse.json({ error: "Market data unavailable" }, { status: 503 });
    }
  }

  try {
    const positions = await getPerpPositionsForAddress(raw as `0x${string}`, stocks);
    return NextResponse.json({ positions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Perp positions fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
