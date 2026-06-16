import "server-only";

import { bulkSetStoredSnapshots } from "@/lib/snapshot-store";
import { isStockListed } from "@/lib/stock-ready";
import { withTimeout } from "@/lib/async-timeout";
import {
  DEMO_SNAPSHOTS,
  getMarketSnapshotsParallel,
  type CryptoStock,
} from "@/lib/sosovalue";

export const isVercelServerless = Boolean(process.env.VERCEL);

const PARALLEL_CHUNK = 25;
const LIVE_PREFETCH_TIMEOUT_MS = 12_000;
const VERCEL_PREFETCH_TIMEOUT_MS = 18_000;

function countListed(stocks: CryptoStock[]): number {
  return stocks.filter((s) => isStockListed(s.ticker)).length;
}

function needsSnapshotPrefetch(stocks: CryptoStock[], options?: { demo?: boolean }): boolean {
  if (options?.demo || !process.env.SOSOVALUE_API_KEY) {
    return countListed(stocks) === 0;
  }
  const listed = countListed(stocks);
  if (listed === 0) return true;
  if (stocks.length <= 6) return true;
  return listed < 40 || listed < stocks.length * 0.35;
}

/** Instant demo prices when SoSoValue is unavailable. */
export function seedDemoSnapshots(stocks: CryptoStock[]) {
  const batch: Record<string, import("@/lib/sosovalue").MarketSnapshot> = {};
  for (const stock of stocks) {
    const demo = DEMO_SNAPSHOTS[stock.ticker];
    if (demo) batch[stock.ticker] = { ...demo, timestamp: Date.now() };
  }
  if (Object.keys(batch).length > 0) bulkSetStoredSnapshots(batch);
}

/** Load prices for the full catalog in parallel (serverless cold start). */
export async function ensureInitialSnapshots(
  stocks: CryptoStock[],
  options?: { demo?: boolean },
): Promise<number> {
  if (!needsSnapshotPrefetch(stocks, options)) return countListed(stocks);

  if (options?.demo || !process.env.SOSOVALUE_API_KEY) {
    seedDemoSnapshots(stocks);
    return countListed(stocks);
  }

  const tickers = stocks.map((s) => s.ticker);
  const timeoutMs = isVercelServerless ? VERCEL_PREFETCH_TIMEOUT_MS : LIVE_PREFETCH_TIMEOUT_MS;
  const fetched = await withTimeout(
    getMarketSnapshotsParallel(tickers, PARALLEL_CHUNK),
    timeoutMs,
  );

  if (fetched && Object.keys(fetched).length > 0) {
    bulkSetStoredSnapshots(fetched);
  }

  if (countListed(stocks) === 0) {
    seedDemoSnapshots(stocks.slice(0, 4));
  }

  return countListed(stocks);
}

export function hasLiveMarketApi(): boolean {
  return Boolean(process.env.SOSOVALUE_API_KEY);
}
