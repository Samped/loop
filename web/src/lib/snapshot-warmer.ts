import { BATCH_DELAY_MS } from "@/lib/market-config";
import { getCachedCryptoStocks } from "@/lib/market-data";
import {
  getStoredKlines,
  getStoredSnapshot,
  getStoredStocks,
  hydrateSnapshotStore,
  isKlinesStale,
  isSnapshotStale,
  persistMarketStore,
  setStoredKlines,
  setStoredSnapshot,
} from "@/lib/snapshot-store";
import {
  isFullSnapshot,
  isStockListed,
  isStockReady,
  type ListedStockPayload,
  type ReadyStockPayload,
} from "@/lib/stock-ready";
import { getKlines, getMarketSnapshot } from "@/lib/sosovalue";

const KLINES_LIMIT = 90;
const RATE_LIMIT_WAIT_MS = 65_000;
const PAUSE_MS = BATCH_DELAY_MS + 200;

type ListedListener = (payload: ListedStockPayload) => void;
type ChartListener = (payload: ReadyStockPayload) => void;
const listedListeners = new Set<ListedListener>();
const chartListeners = new Set<ChartListener>();

let warming = false;
let warmComplete = false;

export function isSnapshotWarmerActive() {
  return warming && !warmComplete;
}

export function onStockListed(listener: ListedListener) {
  listedListeners.add(listener);
  return () => listedListeners.delete(listener);
}

export function onStockReady(listener: ChartListener) {
  chartListeners.add(listener);
  return () => chartListeners.delete(listener);
}

function emitListed(payload: ListedStockPayload) {
  for (const listener of listedListeners) listener(payload);
}

function emitChartReady(payload: ReadyStockPayload) {
  for (const listener of chartListeners) listener(payload);
}

export function startSnapshotWarmer() {
  hydrateSnapshotStore();
  if (warming) return;
  warming = true;
  warmComplete = false;
  void warmSnapshots();
}

async function fetchWithRetry<T>(fetcher: () => Promise<T>, attempts = 3): Promise<T | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetcher();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("RATE_LIMIT") || msg.includes("Too many requests")) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_WAIT_MS));
        continue;
      }
      return null;
    }
  }
  return null;
}

async function warmTicker(ticker: string): Promise<void> {
  let snapshot = getStoredSnapshot(ticker);
  if (!snapshot || isSnapshotStale(ticker)) {
    snapshot = await fetchWithRetry(() => getMarketSnapshot(ticker));
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  if (!snapshot || !isFullSnapshot(snapshot)) return;

  setStoredSnapshot(ticker, snapshot);
  emitListed({ ticker, snapshot });

  let klines = getStoredKlines(ticker);
  if (!klines || isKlinesStale(ticker)) {
    klines = await fetchWithRetry(() => getKlines(ticker, KLINES_LIMIT));
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  if (!klines || klines.length === 0) return;

  setStoredKlines(ticker, klines);
  emitChartReady({ ticker, snapshot, klines });
}

function countListedTickers(): number {
  const stored = getStoredStocks();
  if (!stored) return 0;
  return stored.filter((s) => isStockListed(s.ticker)).length;
}

export async function warmAllSnapshots(): Promise<number> {
  hydrateSnapshotStore();
  let stocks;
  try {
    ({ stocks } = await getCachedCryptoStocks());
  } catch {
    return countListedTickers();
  }

  const pending = stocks
    .map((s) => s.ticker)
    .filter((ticker) => !isStockListed(ticker) || !isStockReady(ticker));

  for (const ticker of pending) {
    await warmTicker(ticker);
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  persistMarketStore();
  return countListedTickers();
}

async function warmSnapshots() {
  try {
    await warmAllSnapshots();
  } finally {
    warmComplete = true;
    warming = false;
  }
}
