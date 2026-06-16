import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { getCachedCryptoStocks } from "@/lib/market-data";
import { getCachedPortfolioForAddress } from "@/lib/portfolio-cache";
import {
  getStoredKlines,
  getStoredSnapshots,
  getStoredStocks,
  hydrateSnapshotStore,
} from "@/lib/snapshot-store";

export const maxDuration = 30;

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

  const snapshots = getStoredSnapshots() ?? {};

  try {
    const portfolio = await getCachedPortfolioForAddress(
      raw as `0x${string}`,
      stocks,
      snapshots,
      (ticker) => getStoredKlines(ticker) ?? undefined,
    );
    return NextResponse.json(portfolio);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Portfolio fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
