import "server-only";

import {
  getStoredSectors,
  getStoredSnapshots,
  getStoredStocks,
  hasBundledMarketCatalog,
  setStoredSectors,
  setStoredStocks,
} from "@/lib/snapshot-store";
import { bulkSetStoredSnapshots } from "@/lib/snapshot-store";
import { isStockListed } from "@/lib/stock-ready";
import { withTimeout } from "@/lib/async-timeout";
import {
  DEMO_SNAPSHOTS,
  getCryptoStocks,
  getMarketSnapshotsParallel,
  getSectors,
  type CryptoStock,
} from "@/lib/sosovalue";

export const isVercelServerless = Boolean(process.env.VERCEL);

const PARALLEL_CHUNK = 25;
const LIVE_PREFETCH_TIMEOUT_MS = 20_000;
const BUNDLE_STALE_MS = 30 * 60 * 1000;

let prefetchInFlight = false;
let refreshInFlight = false;

function countListed(stocks: CryptoStock[]): number {
  return stocks.filter((s) => isStockListed(s.ticker)).length;
}

export function hasLiveMarketApi(): boolean {
  return Boolean(process.env.SOSOVALUE_API_KEY);
}

export function seedDemoSnapshots(stocks: CryptoStock[]) {
  const batch: Record<string, import("@/lib/sosovalue").MarketSnapshot> = {};
  for (const stock of stocks) {
    const demo = DEMO_SNAPSHOTS[stock.ticker];
    if (demo) batch[stock.ticker] = { ...demo, timestamp: Date.now() };
  }
  if (Object.keys(batch).length > 0) bulkSetStoredSnapshots(batch);
}

export async function ensureInitialSnapshots(
  stocks: CryptoStock[],
  options?: { demo?: boolean },
): Promise<number> {
  if (options?.demo || !process.env.SOSOVALUE_API_KEY) {
    if (countListed(stocks) === 0) seedDemoSnapshots(stocks);
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

  return countListed(stocks);
}

export function startBackgroundSnapshotPrefetch(
  stocks: CryptoStock[],
  options?: { demo?: boolean },
) {
  if (prefetchInFlight || options?.demo || !process.env.SOSOVALUE_API_KEY) return;
  prefetchInFlight = true;
  void ensureInitialSnapshots(stocks, options).finally(() => {
    prefetchInFlight = false;
  });
}

export function isSnapshotPrefetchActive(): boolean {
  return prefetchInFlight;
}

/** Refresh catalog and prices in the background when cache is stale. */
export function startBackgroundMarketRefresh(cacheAgeMs: number) {
  if (refreshInFlight || !hasLiveMarketApi()) return;
  if (cacheAgeMs < BUNDLE_STALE_MS) return;

  refreshInFlight = true;
  void (async () => {
    try {
      const refreshed = await withTimeout(Promise.all([getCryptoStocks(), getSectors()]), 8_000);
      if (refreshed) {
        const [liveStocks, liveSectors] = refreshed;
        if (liveStocks.length) setStoredStocks(liveStocks);
        if (liveSectors.length) setStoredSectors(liveSectors);
        startBackgroundSnapshotPrefetch(liveStocks, { demo: false });
      }
    } finally {
      refreshInFlight = false;
    }
  })();
}

export function buildMarketPayloadFromStore() {
  const allStocks = getStoredStocks() ?? [];
  const sectors = getStoredSectors() ?? [];
  const snapshots = getStoredSnapshots();
  const listedStocks = allStocks.filter((s) => isStockListed(s.ticker));

  return {
    allStocks,
    sectors,
    snapshots,
    listedStocks,
    marketSource: hasBundledMarketCatalog() || hasLiveMarketApi() ? "sosovalue" : "demo",
  };
}
