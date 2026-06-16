import "server-only";
import { getStoredStocks, hydrateSnapshotStore } from "@/lib/snapshot-store";

const TICKER_RE = /^[A-Z]{1,6}$/;

export function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidTickerFormat(ticker: string): boolean {
  return TICKER_RE.test(ticker);
}

/** True when ticker exists in the warmed stock catalog. */
export function isCatalogTicker(ticker: string): boolean {
  const upper = normalizeTicker(ticker);
  if (!isValidTickerFormat(upper)) return false;
  hydrateSnapshotStore();
  const stocks = getStoredStocks();
  if (!stocks?.length) return false;
  return stocks.some((s) => s.ticker.toUpperCase() === upper);
}

export function filterCatalogTickers(tickers: string[]): string[] {
  const out: string[] = [];
  for (const raw of tickers) {
    const upper = normalizeTicker(raw);
    if (isCatalogTicker(upper) && !out.includes(upper)) out.push(upper);
  }
  return out;
}
