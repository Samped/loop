import { getFinnhubQuote } from "@/lib/finnhub";
import { getStoredSnapshot, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { getMarketSnapshot } from "@/lib/sosovalue";

const INDEX_CACHE_MS = Number(process.env.PERP_INDEX_CACHE_MS) || 2_000;
const indexCache = new Map<string, { sample: StockIndexSample; at: number }>();

export type StockIndexSample = {
  price: number;
  sourceCount: number;
  sources: string[];
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Multi-source stock index: median of live Finnhub + SoSoValue quotes.
 * No synthetic noise — unpredictability comes from real markets.
 */
export async function fetchStockIndexPrice(ticker: string): Promise<StockIndexSample | null> {
  const upper = ticker.toUpperCase();
  const now = Date.now();
  const cached = indexCache.get(upper);
  if (cached && now - cached.at < INDEX_CACHE_MS) return cached.sample;

  const sample = await fetchStockIndexPriceFresh(upper);
  if (sample) indexCache.set(upper, { sample, at: now });
  return sample;
}

async function fetchStockIndexPriceFresh(ticker: string): Promise<StockIndexSample | null> {
  const upper = ticker.toUpperCase();
  const samples: { price: number; source: string }[] = [];

  try {
    const quote = await getFinnhubQuote(upper);
    if (quote?.c && quote.c > 0) samples.push({ price: quote.c, source: "finnhub" });
  } catch {
    // optional feed
  }

  try {
    const snap = await getMarketSnapshot(upper);
    if (snap.mkt_price > 0) samples.push({ price: snap.mkt_price, source: "sosovalue" });
  } catch {
    // optional feed
  }

  if (samples.length === 0) {
    hydrateSnapshotStore();
    const stored = getStoredSnapshot(upper);
    if (stored?.mkt_price && stored.mkt_price > 0) {
      samples.push({ price: stored.mkt_price, source: "cache" });
    }
  }

  if (samples.length === 0) return null;

  const prices = samples.map((s) => s.price);
  return {
    price: median(prices),
    sourceCount: samples.length,
    sources: samples.map((s) => s.source),
  };
}
