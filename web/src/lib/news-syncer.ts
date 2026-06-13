import { BATCH_DELAY_MS } from "@/lib/market-config";
import { getCryptoPanicPosts } from "@/lib/cryptopanic";
import { getFinnhubCompanyNews } from "@/lib/finnhub";
import { getCachedCryptoStocks } from "@/lib/market-data";
import {
  normalizeCryptoPanicPost,
  normalizeFinnhubArticle,
  normalizeSosoArticle,
  type NewsProvider,
  type StoredNewsArticle,
} from "@/lib/news";
import {
  getCoinDeskNews,
  getGoogleNewsForTicker,
  normalizeCoinDeskItem,
  normalizeGoogleNewsItem,
  repairMarketsArticle,
} from "@/lib/news-rss";
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
const FINNHUB_TICKERS_PER_SYNC = 6;
const STALE_MS = 12 * 60 * 1000;
const FINNHUB_DELAY_MS = 1_500;

export type NewsSyncStatus = {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastSyncAt: number | null;
  lastArticleCount: number;
  lastIngested: Record<NewsProvider, number>;
  lastError: string | null;
  sources: {
    sosovalue: boolean;
    finnhub: boolean;
    cryptopanic: boolean;
    markets: boolean;
    crypto: boolean;
  };
};

const state: NewsSyncStatus = {
  enabled: false,
  running: false,
  intervalMs: DEFAULT_INTERVAL_MS,
  lastSyncAt: null,
  lastArticleCount: 0,
  lastIngested: {
    sosovalue: 0,
    finnhub: 0,
    cryptopanic: 0,
    markets: 0,
    crypto: 0,
  },
  lastError: null,
  sources: {
    sosovalue: false,
    finnhub: false,
    cryptopanic: false,
    markets: false,
    crypto: false,
  },
};

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

function configuredSources() {
  return {
    sosovalue: Boolean(process.env.SOSOVALUE_API_KEY),
    finnhub: Boolean(process.env.FINNHUB_API_KEY),
    cryptopanic: Boolean(process.env.CRYPTOPANIC_API_KEY),
    markets: !process.env.FINNHUB_API_KEY,
    crypto: !process.env.CRYPTOPANIC_API_KEY,
  };
}

function hasAnyNewsSource() {
  const sources = configuredSources();
  return sources.sosovalue || sources.finnhub || sources.cryptopanic || sources.markets || sources.crypto;
}

export function getNewsSyncStatus(): NewsSyncStatus {
  return { ...state, sources: configuredSources() };
}

async function fetchWithRetry<T>(fetcher: () => Promise<T>, attempts = 3): Promise<T | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetcher();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("RATE_LIMIT") || msg.includes("Too many requests") || msg.includes("429")) {
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

function dedupeSosoArticles(lists: SosoNewsArticle[][]): SosoNewsArticle[] {
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
  return dedupeSosoArticles([byTicker ?? [], byName ?? []]);
}

function ingestArticles(articles: StoredNewsArticle[]) {
  const valid = articles.filter((a) => a.url && a.title);
  if (valid.length) {
    upsertNewsArticles(valid);
    persistNewsStore();
  }
  return valid.length;
}

async function syncSoSoValue(catalog: Awaited<ReturnType<typeof getCatalog>>, includeTickerSearch: boolean) {
  if (!process.env.SOSOVALUE_API_KEY) return 0;

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

  const raw = dedupeSosoArticles([feed ?? [], hot ?? [], featured ?? [], searched]);
  const normalized = raw
    .map((article) => normalizeSosoArticle(article, catalog))
    .filter((article): article is StoredNewsArticle => article !== null);

  return ingestArticles(normalized);
}

async function syncFinnhub(catalog: Awaited<ReturnType<typeof getCatalog>>) {
  const listed = catalog.filter((s) => isStockListed(s.ticker));
  const targets = (listed.length ? listed : catalog).slice(0, 80);
  const offset = Math.floor(Date.now() / (10 * 60 * 1000)) % Math.max(targets.length, 1);
  const batch = [...targets.slice(offset), ...targets].slice(0, FINNHUB_TICKERS_PER_SYNC);

  if (process.env.FINNHUB_API_KEY) {
    const normalized: StoredNewsArticle[] = [];
    for (const stock of batch) {
      const articles = await fetchWithRetry(() => getFinnhubCompanyNews(stock.ticker));
      if (articles) {
        for (const article of articles.slice(0, 12)) {
          const item = normalizeFinnhubArticle(article, stock.ticker, catalog);
          if (item) normalized.push(item);
        }
      }
      await new Promise((r) => setTimeout(r, FINNHUB_DELAY_MS));
    }
    return ingestArticles(normalized);
  }

  const normalized: StoredNewsArticle[] = [];
  for (const stock of batch) {
    const items = await fetchWithRetry(() => getGoogleNewsForTicker(stock.ticker, 10));
    if (items) {
      for (const item of items) {
        const article = normalizeGoogleNewsItem(item, stock.ticker, catalog, stock.name);
        if (article) normalized.push(article);
      }
    }
    await new Promise((r) => setTimeout(r, FINNHUB_DELAY_MS));
  }

  return ingestArticles(normalized);
}

async function syncCryptoPanic(catalog: Awaited<ReturnType<typeof getCatalog>>) {
  if (process.env.CRYPTOPANIC_API_KEY) {
    const [hot, important] = await Promise.all([
      fetchWithRetry(() => getCryptoPanicPosts({ filter: "hot", currencies: ["BTC", "ETH"] })),
      fetchWithRetry(() => getCryptoPanicPosts({ filter: "important", currencies: ["BTC", "ETH"] })),
    ]);

    const hotPosts = hot ?? [];
    const importantPosts = important ?? [];
    const byId = new Map<number, (typeof hotPosts)[number]>();
    for (const post of [...hotPosts, ...importantPosts]) {
      byId.set(post.id, post);
    }

    const normalized = [...byId.values()]
      .map((post) => normalizeCryptoPanicPost(post, catalog))
      .filter((article): article is StoredNewsArticle => article !== null);

    return ingestArticles(normalized);
  }

  const items = await fetchWithRetry(() => getCoinDeskNews(30));
  const normalized = (items ?? [])
    .map((item) => normalizeCoinDeskItem(item, catalog))
    .filter((article): article is StoredNewsArticle => article !== null);

  return ingestArticles(normalized);
}

async function runSync(includeTickerSearch = true) {
  if (state.running) return 0;
  if (!hasAnyNewsSource()) {
    state.enabled = false;
    state.lastError = "Set SOSOVALUE_API_KEY, FINNHUB_API_KEY, or CRYPTOPANIC_API_KEY (RSS fallbacks run when API keys are missing)";
    return 0;
  }

  state.enabled = true;
  state.running = true;
  state.lastError = null;
  state.sources = configuredSources();

  try {
    hydrateNewsStore();
    const catalog = await getCatalog();

    const sosoCount = await syncSoSoValue(catalog, includeTickerSearch);
    const finnhubCount = await syncFinnhub(catalog);
    const panicCount = await syncCryptoPanic(catalog);
    const count = sosoCount + finnhubCount + panicCount;

    state.lastSyncAt = Date.now();
    state.lastArticleCount = count;
    state.lastIngested = {
      sosovalue: sosoCount,
      finnhub: process.env.FINNHUB_API_KEY ? finnhubCount : 0,
      cryptopanic: process.env.CRYPTOPANIC_API_KEY ? panicCount : 0,
      markets: process.env.FINNHUB_API_KEY ? 0 : finnhubCount,
      crypto: process.env.CRYPTOPANIC_API_KEY ? 0 : panicCount,
    };
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

/** Ingest headlines from SoSoValue, Finnhub, and CryptoPanic into data/news.json. */
export function startNewsSyncer() {
  if (started) return;
  started = true;

  if (!hasAnyNewsSource()) {
    state.enabled = false;
    state.lastError = "Set SOSOVALUE_API_KEY, FINNHUB_API_KEY, or CRYPTOPANIC_API_KEY (RSS fallbacks run when API keys are missing)";
    return;
  }

  const intervalMs = Number(process.env.NEWS_SYNC_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
  state.intervalMs = intervalMs;
  state.enabled = true;
  state.sources = configuredSources();

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
