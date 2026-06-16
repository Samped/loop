import "server-only";

import { getCachedMarketSnapshot } from "@/lib/market-data";
import { bulkSetStoredSnapshots } from "@/lib/snapshot-store";
import { isStockListed } from "@/lib/stock-ready";
import { withTimeout } from "@/lib/async-timeout";
import { DEMO_SNAPSHOTS, type CryptoStock } from "@/lib/sosovalue";

export const isVercelServerless = Boolean(process.env.VERCEL);

const INITIAL_SNAPSHOT_BATCH = 12;
const LIVE_PREFETCH_TIMEOUT_MS = 7_000;

function countListed(stocks: CryptoStock[]): number {
  return stocks.filter((s) => isStockListed(s.ticker)).length;
}

/** Instant demo prices when SoSoValue is unavailable or still warming. */
export function seedDemoSnapshots(stocks: CryptoStock[]) {
  const batch: Record<string, import("@/lib/sosovalue").MarketSnapshot> = {};
  for (const stock of stocks) {
    const demo = DEMO_SNAPSHOTS[stock.ticker];
    if (demo) batch[stock.ticker] = { ...demo, timestamp: Date.now() };
  }
  if (Object.keys(batch).length > 0) bulkSetStoredSnapshots(batch);
}

/** Load first-page prices during the request so serverless cold starts show markets immediately. */
export async function ensureInitialSnapshots(
  stocks: CryptoStock[],
  options?: { demo?: boolean },
): Promise<number> {
  if (countListed(stocks) > 0) return countListed(stocks);

  if (options?.demo || !process.env.SOSOVALUE_API_KEY) {
    seedDemoSnapshots(stocks);
    return countListed(stocks);
  }

  const tickers = stocks.slice(0, INITIAL_SNAPSHOT_BATCH).map((s) => s.ticker);
  const fetched = await withTimeout(
    Promise.allSettled(tickers.map((ticker) => getCachedMarketSnapshot(ticker))),
    LIVE_PREFETCH_TIMEOUT_MS,
  );

  if (fetched) {
    const batch: Record<string, import("@/lib/sosovalue").MarketSnapshot> = {};
    for (let i = 0; i < fetched.length; i++) {
      const outcome = fetched[i];
      if (outcome?.status === "fulfilled") {
        batch[tickers[i]!] = outcome.value.snapshot;
      }
    }
    if (Object.keys(batch).length > 0) bulkSetStoredSnapshots(batch);
  }

  if (countListed(stocks) === 0) {
    seedDemoSnapshots(stocks.slice(0, 4));
  }

  return countListed(stocks);
}
