import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { NewsProvider, StoredNewsArticle } from "@/lib/news";
import { stripHtml } from "@/lib/news";
import { repairMarketsArticle } from "@/lib/news-rss";

const STORE_PATH = join(process.cwd(), "data", "news.json");
const BUNDLE_PATH = join(process.cwd(), "public", "news-cache.json");
const MAX_ARTICLES = 500;

/** Keep secondary sources from being evicted by high-volume SoSoValue tweets. */
const PROVIDER_QUOTAS: Record<NewsProvider, number> = {
  sosovalue: 280,
  finnhub: 100,
  cryptopanic: 50,
  crypto: 50,
  markets: 60,
};

function rebuildByTicker(list: StoredNewsArticle[]): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const article of list) {
    indexArticle(article, next);
  }
  return next;
}

function trimArticles(all: StoredNewsArticle[]): StoredNewsArticle[] {
  const byProvider = new Map<NewsProvider, StoredNewsArticle[]>();

  for (const article of all) {
    const provider = article.provider || "sosovalue";
    const bucket = byProvider.get(provider) ?? [];
    bucket.push(article);
    byProvider.set(provider, bucket);
  }

  const kept: StoredNewsArticle[] = [];
  for (const [provider, quota] of Object.entries(PROVIDER_QUOTAS) as [NewsProvider, number][]) {
    const bucket = (byProvider.get(provider) ?? []).sort((a, b) => b.timestamp - a.timestamp);
    kept.push(...bucket.slice(0, quota));
  }

  return kept.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_ARTICLES);
}

type NewsFile = {
  updatedAt: number;
  articles: StoredNewsArticle[];
  byTicker: Record<string, string[]>;
  tickerSearchCursor: number;
};

let hydrated = false;
let updatedAt = 0;
let articles: StoredNewsArticle[] = [];
let byTicker: Record<string, string[]> = {};
let tickerSearchCursor = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function loadNewsFile(path: string): NewsFile | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as NewsFile;
  } catch {
    return null;
  }
}

function applyNewsFile(raw: NewsFile) {
  const rawArticles = raw.articles ?? [];
  articles = repairArticles(rawArticles);
  byTicker = {};
  for (const article of articles) {
    indexArticle(article, byTicker);
  }
  tickerSearchCursor = raw.tickerSearchCursor ?? 0;
  updatedAt = raw.updatedAt ?? 0;
}

function ensureHydrated() {
  if (hydrated) return;
  hydrated = true;

  const candidates = [STORE_PATH, BUNDLE_PATH].filter((p) => existsSync(p));
  let best: NewsFile | null = null;
  for (const path of candidates) {
    const raw = loadNewsFile(path);
    if (!raw) continue;
    if (!best || (raw.updatedAt ?? 0) >= (best.updatedAt ?? 0)) best = raw;
  }
  if (!best) return;

  applyNewsFile(best);

  if (articles.length !== (best.articles ?? []).length && !process.env.VERCEL) {
    updatedAt = Date.now();
    writeFileSync(
      STORE_PATH,
      JSON.stringify({
        updatedAt,
        articles,
        byTicker,
        tickerSearchCursor,
      } satisfies NewsFile),
    );
  }
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistNewsStore();
  }, 2000);
}

function repairStoredArticle(article: StoredNewsArticle): StoredNewsArticle | null {
  if (article.provider === "markets") {
    return repairMarketsArticle(article);
  }

  const hasHtml = /<|&lt;|target=|href=/i.test(`${article.title} ${article.summary} ${article.content}`);
  if (!hasHtml) return article;

  return {
    ...article,
    title: stripHtml(article.title),
    summary: stripHtml(article.summary),
    content: stripHtml(article.content) || stripHtml(article.title),
  };
}

function repairArticles(raw: StoredNewsArticle[]): StoredNewsArticle[] {
  const repaired: StoredNewsArticle[] = [];
  for (const article of raw) {
    const fixed = repairStoredArticle({
      ...article,
      provider: article.provider || "sosovalue",
    });
    if (fixed) repaired.push(fixed);
  }
  return repaired;
}

function indexArticle(article: StoredNewsArticle, nextByTicker: Record<string, string[]>) {
  for (const ticker of article.tickers) {
    const upper = ticker.toUpperCase();
    const ids = nextByTicker[upper] ?? [];
    if (!ids.includes(article.id)) {
      nextByTicker[upper] = [article.id, ...ids];
    }
  }
}

export function hydrateNewsStore() {
  ensureHydrated();
}

export function getNewsStoreUpdatedAt(): number {
  ensureHydrated();
  return updatedAt;
}

export function getStoredNewsArticles(limit = 500): StoredNewsArticle[] {
  ensureHydrated();
  return [...articles]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

export function getProviderCounts(): Record<NewsProvider, number> {
  ensureHydrated();
  const counts: Record<NewsProvider, number> = {
    sosovalue: 0,
    finnhub: 0,
    cryptopanic: 0,
    crypto: 0,
    markets: 0,
  };
  for (const article of articles) {
    const provider = article.provider || "sosovalue";
    counts[provider]++;
  }
  return counts;
}

export function getStoredNewsArticle(id: string): StoredNewsArticle | null {
  ensureHydrated();
  return articles.find((a) => a.id === id) ?? null;
}

export function getStoredNewsForTicker(ticker: string, limit = 20): StoredNewsArticle[] {
  ensureHydrated();
  const upper = ticker.toUpperCase();
  const ids = byTicker[upper] ?? [];
  const byId = new Map(articles.map((a) => [a.id, a]));
  const result: StoredNewsArticle[] = [];

  for (const id of ids) {
    const article = byId.get(id);
    if (article) result.push(article);
    if (result.length >= limit) break;
  }

  if (result.length < limit) {
    for (const article of articles) {
      if (article.tickers.includes(upper) && !result.some((r) => r.id === article.id)) {
        result.push(article);
      }
      if (result.length >= limit) break;
    }
  }

  return result.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

export function getTickerSearchCursor(): number {
  ensureHydrated();
  return tickerSearchCursor;
}

export function setTickerSearchCursor(cursor: number) {
  ensureHydrated();
  tickerSearchCursor = cursor;
  schedulePersist();
}

export function upsertNewsArticles(incoming: StoredNewsArticle[]) {
  ensureHydrated();
  if (!incoming.length) return;

  const byId = new Map(articles.map((a) => [a.id, a]));
  const nextByTicker = { ...byTicker };

  for (const article of incoming) {
    const existing = byId.get(article.id);
    if (existing) {
      const mergedTickers = [...new Set([...existing.tickers, ...article.tickers])];
      const candidates = [article.content, article.summary, existing.content, existing.summary, existing.title, article.title];
      const content = candidates
        .map((v) => stripHtml(v?.trim() ?? ""))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)[0] ?? "";
      const merged = {
        ...existing,
        ...article,
        tickers: mergedTickers,
        content,
        summary: stripHtml(article.summary || existing.summary),
        title: stripHtml(article.title || existing.title),
        provider: article.provider || existing.provider || "sosovalue",
      };
      byId.set(article.id, merged);
      indexArticle(merged, nextByTicker);
    } else {
      byId.set(article.id, article);
      indexArticle(article, nextByTicker);
    }
  }

  articles = trimArticles([...byId.values()]);
  byTicker = rebuildByTicker(articles);
  updatedAt = Date.now();
  schedulePersist();
}

export function persistNewsStore() {
  if (process.env.VERCEL) return;
  ensureHydrated();
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const payload: NewsFile = {
    updatedAt,
    articles,
    byTicker,
    tickerSearchCursor,
  };
  writeFileSync(STORE_PATH, JSON.stringify(payload));
}
