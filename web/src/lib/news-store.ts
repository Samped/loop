import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { StoredNewsArticle } from "@/lib/news";

const STORE_PATH = join(process.cwd(), "data", "news.json");
const MAX_ARTICLES = 500;

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

function ensureHydrated() {
  if (hydrated) return;
  hydrated = true;

  if (!existsSync(STORE_PATH)) return;

  try {
    const raw = JSON.parse(readFileSync(STORE_PATH, "utf8")) as NewsFile;
    articles = raw.articles ?? [];
    byTicker = raw.byTicker ?? {};
    tickerSearchCursor = raw.tickerSearchCursor ?? 0;
    updatedAt = raw.updatedAt ?? 0;
  } catch {
    articles = [];
    byTicker = {};
    tickerSearchCursor = 0;
    updatedAt = 0;
  }
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistNewsStore();
  }, 2000);
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
      const candidates = [article.content, existing.content, existing.summary, existing.title, article.summary];
      const content = candidates
        .map((v) => v?.trim() ?? "")
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)[0] ?? "";
      const merged = {
        ...existing,
        ...article,
        tickers: mergedTickers,
        content,
        summary: article.summary || existing.summary,
      };
      byId.set(article.id, merged);
      indexArticle(merged, nextByTicker);
    } else {
      byId.set(article.id, article);
      indexArticle(article, nextByTicker);
    }
  }

  articles = [...byId.values()]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_ARTICLES);
  byTicker = nextByTicker;
  updatedAt = Date.now();
  schedulePersist();
}

export function persistNewsStore() {
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
