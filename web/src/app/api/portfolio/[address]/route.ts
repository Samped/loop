import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { getCachedCryptoStocks } from "@/lib/market-data";
import { getContractPrices } from "@/lib/contract-prices";
import { getPortfolioForAddress } from "@/lib/portfolio";
import { mergePriceSources } from "@/lib/snapshot-utils";
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

  const tickers = stocks.map((s) => s.ticker);
  const stored = getStoredSnapshots();

  let contractPrices: Record<string, bigint> = {};
  try {
    contractPrices = await getContractPrices(tickers);
  } catch {
    contractPrices = {};
  }

  const snapshots = mergePriceSources(tickers, stored, contractPrices);

  try {
    const portfolio = await getPortfolioForAddress(
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
