import type { CryptoStock } from "@/lib/sosovalue";
import type { SosoNewsArticle } from "@/lib/sosovalue";

export type NewsItem = {
  id: string;
  category: "article" | "sector" | "stock" | "market";
  title: string;
  summary: string;
  ticker?: string;
  tickers?: string[];
  changePct?: number;
  timestamp: number;
  url?: string;
  author?: string;
  source?: "sosovalue" | "synthetic";
};

export type StoredNewsArticle = {
  id: string;
  title: string;
  summary: string;
  author: string;
  url: string;
  timestamp: number;
  tickers: string[];
};

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function articleUrl(article: SosoNewsArticle): string {
  return article.original_link || article.source_link || "";
}

export function articleTimestamp(article: SosoNewsArticle): number {
  const ts = Number(article.release_time);
  return Number.isFinite(ts) ? ts : Date.now();
}

export function articleTitle(article: SosoNewsArticle): string {
  if (article.title) return stripHtml(article.title);
  const text = stripHtml(article.content ?? "");
  if (!text) return "Untitled";
  const first = text.split(/[.!?\n]/)[0]?.trim();
  return first && first.length > 10 ? first.slice(0, 160) : text.slice(0, 160);
}

export function articleSummary(article: SosoNewsArticle, maxLen = 280): string {
  const text = stripHtml(article.content ?? article.title ?? "");
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trim()}…`;
}

export function matchArticleTickers(article: SosoNewsArticle, catalog: CryptoStock[]): string[] {
  const matched = new Set<string>();
  const tickerSet = new Set(catalog.map((s) => s.ticker.toUpperCase()));
  const nameByTicker = new Map(catalog.map((s) => [s.ticker.toUpperCase(), s.name.toLowerCase()]));

  for (const currency of article.matched_currencies ?? []) {
    const symbol = currency.symbol?.toUpperCase();
    if (symbol && tickerSet.has(symbol)) matched.add(symbol);
  }

  const haystack = [
    article.title ?? "",
    article.content ?? "",
    ...(article.tags ?? []),
    article.author ?? "",
  ]
    .join(" ")
    .toLowerCase();

  for (const stock of catalog) {
    const ticker = stock.ticker.toUpperCase();
    const name = stock.name.toLowerCase();
    const tickerRe = new RegExp(`\\b${ticker}\\b`, "i");
    if (tickerRe.test(haystack)) {
      matched.add(ticker);
      continue;
    }
    if (name.length >= 4 && haystack.includes(name)) {
      matched.add(ticker);
    }
  }

  for (const tag of article.tags ?? []) {
    const upper = tag.toUpperCase();
    if (tickerSet.has(upper)) matched.add(upper);
    for (const [ticker, name] of nameByTicker) {
      if (tag.toLowerCase() === name) matched.add(ticker);
    }
  }

  return [...matched];
}

export function normalizeSosoArticle(article: SosoNewsArticle, catalog: CryptoStock[]): StoredNewsArticle | null {
  const url = articleUrl(article);
  if (!url) return null;

  return {
    id: article.id,
    title: articleTitle(article),
    summary: articleSummary(article),
    author: article.author || article.nick_name || "SoSoValue",
    url,
    timestamp: articleTimestamp(article),
    tickers: matchArticleTickers(article, catalog),
  };
}

export function storedToNewsItem(article: StoredNewsArticle): NewsItem {
  return {
    id: article.id,
    category: "article",
    title: article.title,
    summary: article.summary,
    ticker: article.tickers[0],
    tickers: article.tickers,
    timestamp: article.timestamp,
    url: article.url,
    author: article.author,
    source: "sosovalue",
  };
}
