import { BATCH_DELAY_MS } from "@/lib/market-config";
import { getCachedCryptoStocks } from "@/lib/market-data";
import { normalizeSosoArticle } from "@/lib/news";
import {
  getNewsStoreUpdatedAt,
  getTickerSearchCursor,
  hydrateNewsStore,
  persistNewsStore,
  setTickerSearchCursor,
  upsertNewsArticles,
} from "@/lib/news-store";
import { getStoredStocks, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { isStockListed } from "@/lib/stock-ready";
import {
  getFeaturedNews,
  getHotNews,
  getNewsFeed,
  searchNews,
  type SosoNewsArticle,
} from "@/lib/sosovalue";

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const STARTUP_DELAY_MS = 15_000;
const RATE_LIMIT_WAIT_MS = 65_000;
const TICKERS_PER_SYNC = 4;
const STALE_MS = 12 * 60 * 1000;

export type NewsSyncStatus = {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastSyncAt: number | null;
  lastArticleCount: number;
  lastError: string | null;
};

const state: NewsSyncStatus = {
  enabled: false,
  running: false,
  intervalMs: DEFAULT_INTERVAL_MS,
  lastSyncAt: null,
  lastArticleCount: 0,
  lastError: null,
};

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

export function getNewsSyncStatus(): NewsSyncStatus {
  return { ...state };
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

async function getCatalog() {
  hydrateSnapshotStore();
  const stored = getStoredStocks();
  if (stored?.length) return stored;
  try {
    const { stocks } = await getCachedCryptoStocks();
    return stocks;
  } catch {
    return [];
  }
}

function dedupeArticles(lists: SosoNewsArticle[][]): SosoNewsArticle[] {
  const byId = new Map<string, SosoNewsArticle>();
  for (const list of lists) {
    for (const article of list) {
      byId.set(article.id, article);
    }
  }
  return [...byId.values()];
}

async function searchTickerNews(ticker: string, name: string) {
  const byTicker = await fetchWithRetry(() => searchNews(ticker, 8));
  await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  const byName = name.length >= 4 ? await fetchWithRetry(() => searchNews(name, 6)) : null;
  return dedupeArticles([byTicker ?? [], byName ?? []]);
}

async function ingestArticles(raw: SosoNewsArticle[]) {
  const catalog = await getCatalog();
  const normalized = raw
    .map((article) => normalizeSosoArticle(article, catalog))
    .filter((article): article is NonNullable<typeof article> => article !== null);

  if (normalized.length) {
    upsertNewsArticles(normalized);
    persistNewsStore();
  }

  return normalized.length;
}

async function runSync(includeTickerSearch = true) {
  if (state.running) return 0;
  if (!process.env.SOSOVALUE_API_KEY) {
    state.enabled = false;
    state.lastError = "SOSOVALUE_API_KEY not configured";
    return 0;
  }

  state.enabled = true;
  state.running = true;
  state.lastError = null;

  try {
    hydrateNewsStore();
    const catalog = await getCatalog();
    const listed = catalog.filter((s) => isStockListed(s.ticker));

    const feed = await fetchWithRetry(() => getNewsFeed(1, 40));
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    const hot = await fetchWithRetry(() => getHotNews(20));
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    const featured = await fetchWithRetry(() => getFeaturedNews(20));

    const searched: SosoNewsArticle[] = [];
    if (includeTickerSearch) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      const searchTargets = (listed.length ? listed : catalog).slice(0, 80);
      const cursor = getTickerSearchCursor();
      const batch = searchTargets.slice(cursor, cursor + TICKERS_PER_SYNC);
      const nextCursor = cursor + TICKERS_PER_SYNC >= searchTargets.length ? 0 : cursor + TICKERS_PER_SYNC;
      setTickerSearchCursor(nextCursor);

      for (const stock of batch) {
        const results = await searchTickerNews(stock.ticker, stock.name);
        searched.push(...results);
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    const raw = dedupeArticles([feed ?? [], hot ?? [], featured ?? [], searched]);
    const count = await ingestArticles(raw);

    state.lastSyncAt = Date.now();
    state.lastArticleCount = count;
    return count;
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : "News sync failed";
    return 0;
  } finally {
    state.running = false;
  }
}

/** Run a news sync immediately (used by API + CLI). */
export async function syncNewsNow(options?: { tickerSearch?: boolean }) {
  return runSync(options?.tickerSearch ?? true);
}

/** Ingest SoSoValue headlines into data/news.json for the feed and stock pages. */
export function startNewsSyncer() {
  if (started) return;
  started = true;

  if (!process.env.SOSOVALUE_API_KEY) {
    state.enabled = false;
    state.lastError = "Set SOSOVALUE_API_KEY to enable news sync";
    return;
  }

  const intervalMs = Number(process.env.NEWS_SYNC_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
  state.intervalMs = intervalMs;
  state.enabled = true;

  const lastUpdated = getNewsStoreUpdatedAt();
  const stale = !lastUpdated || Date.now() - lastUpdated > STALE_MS;
  const delay = stale ? STARTUP_DELAY_MS : STARTUP_DELAY_MS + 30_000;

  setTimeout(() => void runSync(!lastUpdated), delay);
  timer = setInterval(() => void runSync(true), intervalMs);
}

export function stopNewsSyncer() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
