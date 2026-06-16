import { cachedFetch } from "@/lib/market-cache";
import { getStoredSectors, getStoredStocks, setStoredSectors, setStoredStocks } from "@/lib/snapshot-store";
import {
  type CryptoStock,
  type Kline,
  type MarketSnapshot,
  type Sector,
  getCryptoStocks,
  getKlines,
  getMarketSnapshot,
  getSectors,
  normalizeKline,
} from "@/lib/sosovalue";

const STOCKS_TTL_MS = 15 * 60 * 1000;
const SECTORS_TTL_MS = 15 * 60 * 1000;
const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const KLINES_TTL_MS = 15 * 60 * 1000;

export async function getCachedCryptoStocks(): Promise<{ stocks: CryptoStock[]; stale: boolean }> {
  try {
    const { data, stale, fromCache } = await cachedFetch("crypto-stocks", STOCKS_TTL_MS, getCryptoStocks);
    if (!fromCache) setStoredStocks(data);
    return { stocks: data, stale };
  } catch {
    const stored = getStoredStocks();
    if (stored?.length) return { stocks: stored, stale: true };
    throw new Error("No stock list available");
  }
}

export async function getCachedSectors(): Promise<{ sectors: Sector[]; stale: boolean }> {
  try {
    const { data, stale, fromCache } = await cachedFetch("crypto-sectors", SECTORS_TTL_MS, getSectors);
    if (!fromCache) setStoredSectors(data);
    return { sectors: data, stale };
  } catch {
    const stored = getStoredSectors();
    if (stored?.length) return { sectors: stored, stale: true };
    throw new Error("No sector data available");
  }
}

export async function getCachedStock(ticker: string): Promise<CryptoStock | null> {
  const { stocks } = await getCachedCryptoStocks();
  return stocks.find((s) => s.ticker.toUpperCase() === ticker.toUpperCase()) ?? null;
}

export async function getCachedMarketSnapshot(
  ticker: string,
): Promise<{ snapshot: MarketSnapshot; stale: boolean; fromCache: boolean }> {
  const upper = ticker.toUpperCase();
  const key = `snapshot:${upper}`;
  const { data, stale, fromCache } = await cachedFetch(key, SNAPSHOT_TTL_MS, () => getMarketSnapshot(upper));
  const { setStoredSnapshot } = await import("@/lib/snapshot-store");
  if (!fromCache) setStoredSnapshot(upper, data);
  return { snapshot: data, stale, fromCache };
}

export async function getCachedKlines(ticker: string, limit: number): Promise<{ klines: Kline[]; stale: boolean }> {
  const upper = ticker.toUpperCase();
  const key = `klines:${upper}:${limit}`;
  const { data, stale, fromCache } = await cachedFetch(key, KLINES_TTL_MS, () => getKlines(upper, limit));
  if (!fromCache) {
    const { setStoredKlines } = await import("@/lib/snapshot-store");
    setStoredKlines(upper, data);
  }
  return { klines: data.map(normalizeKline), stale };
}
