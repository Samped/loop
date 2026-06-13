import type { MarketSnapshot } from "@/lib/sosovalue";
import { formatUsdc } from "@/lib/usdc";

export function contractPriceToSnapshot(ticker: string, priceUsdc: bigint): MarketSnapshot {
  const price = Number(formatUsdc(priceUsdc));
  return {
    timestamp: Date.now(),
    ticker,
    mkt_price: price,
    mkt_status: "open",
    volume: 0,
    turnover: 0,
    circulating_marketcap: 0,
    total_marketcap: 0,
    pe_ttm: 0,
    pb: 0,
  };
}

export function mergePriceSources(
  tickers: string[],
  cached: Record<string, MarketSnapshot>,
  contractPrices: Record<string, bigint>,
): Record<string, MarketSnapshot> {
  const merged: Record<string, MarketSnapshot> = {};
  for (const ticker of tickers) {
    if (cached[ticker]) {
      merged[ticker] = cached[ticker];
    } else if (contractPrices[ticker] && contractPrices[ticker] > 0n) {
      merged[ticker] = contractPriceToSnapshot(ticker, contractPrices[ticker]);
    }
  }
  return merged;
}
