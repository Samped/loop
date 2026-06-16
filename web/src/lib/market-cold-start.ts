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

const PARALLEL_CHUNK = 20;
const LIVE_PREFETCH_TIMEOUT_MS = 12_000;

function countListed(stocks: CryptoStock[]): number {
  return stocks.filter((s) => isStockListed(s.ticker)).length;
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
  if (countListed(stocks) > 0) return countListed(stocks);

  if (options?.demo || !process.env.SOSOVALUE_API_KEY) {
    seedDemoSnapshots(stocks);
    return countListed(stocks);
  }

  const tickers = stocks.map((s) => s.ticker);
  const fetched = await withTimeout(
    getMarketSnapshotsParallel(tickers, PARALLEL_CHUNK),
    LIVE_PREFETCH_TIMEOUT_MS,
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
