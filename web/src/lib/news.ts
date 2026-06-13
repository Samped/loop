import type { CryptoPanicPost } from "@/lib/cryptopanic";
import type { FinnhubNewsArticle } from "@/lib/finnhub";
import type { CryptoStock } from "@/lib/sosovalue";
import type { SosoNewsArticle } from "@/lib/sosovalue";

export type NewsProvider = "sosovalue" | "finnhub" | "cryptopanic" | "markets" | "crypto";

export type NewsItem = {
  id: string;
  category: "article" | "sector" | "stock" | "market";
  title: string;
  summary: string;
  content?: string;
  ticker?: string;
  tickers?: string[];
  changePct?: number;
  timestamp: number;
  url?: string;
  author?: string;
  source?: NewsProvider | "synthetic";
};

export type StoredNewsArticle = {
  id: string;
  title: string;
  summary: string;
  content: string;
  author: string;
  url: string;
  timestamp: number;
  tickers: string[];
  provider: NewsProvider;
};

export function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function stripHtml(html: string): string {
  let text = decodeHtmlEntities(html);
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, "");
  return text.replace(/\s+/g, " ").trim();
}

export function articleUrl(article: SosoNewsArticle): string {
  return article.original_link || article.source_link || "";
}

export function articleTimestamp(article: SosoNewsArticle): number {
  const ts = Number(article.release_time);
  return Number.isFinite(ts) ? ts : Date.now();
}

export function articleTitle(article: SosoNewsArticle): string {
  if (article.title) {
    const title = stripHtml(article.title);
    if (title.length <= 120) return title;
    const first = title.split(/[.!?\n]/)[0]?.trim();
    return first && first.length > 10 ? first.slice(0, 120) : title.slice(0, 120);
  }
  const text = stripHtml(article.content ?? "");
  if (!text) return "Untitled";
  const first = text.split(/[.!?\n]/)[0]?.trim();
  return first && first.length > 10 ? first.slice(0, 120) : text.slice(0, 120);
}

export function articleBody(article: SosoNewsArticle): string {
  const fromContent = stripHtml(article.content ?? "");
  if (fromContent) return fromContent;
  return stripHtml(article.title ?? "");
}

export function articleSummary(article: SosoNewsArticle, maxLen = 200): string {
  const text = stripHtml(article.content ?? article.title ?? "");
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trim()}…`;
}

const CRYPTO_CURRENCY_TICKERS: Record<string, string[]> = {
  BTC: ["MSTR", "COIN", "HOOD"],
  ETH: ["COIN"],
  SOL: ["COIN"],
};

export function matchTextToTickers(text: string, catalog: CryptoStock[], extraTickers: string[] = []): string[] {
  const matched = new Set<string>(extraTickers.map((t) => t.toUpperCase()));
  const tickerSet = new Set(catalog.map((s) => s.ticker.toUpperCase()));
  const haystack = text.toLowerCase();

  for (const stock of catalog) {
    const ticker = stock.ticker.toUpperCase();
    const name = stock.name.toLowerCase();
    const tickerRe = new RegExp(`\\b${ticker}\\b`, "i");
    if (tickerRe.test(haystack)) matched.add(ticker);
    else if (name.length >= 4 && haystack.includes(name)) matched.add(ticker);
  }

  return [...matched].filter((t) => tickerSet.has(t));
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
    .join(" ");

  for (const ticker of matchTextToTickers(haystack, catalog)) {
    matched.add(ticker);
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
    content: articleBody(article),
    author: article.author || article.nick_name || "SoSoValue",
    url,
    timestamp: articleTimestamp(article),
    tickers: matchArticleTickers(article, catalog),
    provider: "sosovalue",
  };
}

export function normalizeFinnhubArticle(
  article: FinnhubNewsArticle,
  ticker: string,
  catalog: CryptoStock[],
): StoredNewsArticle | null {
  if (!article.url || !article.headline) return null;

  const body = stripHtml(article.summary || article.headline);
  const summary = body.length <= 200 ? body : `${body.slice(0, 200).trim()}…`;
  const upper = ticker.toUpperCase();
  const tickers = matchTextToTickers(`${article.headline} ${body}`, catalog, [upper]);

  return {
    id: `finnhub-${article.id}`,
    title: stripHtml(article.headline),
    summary,
    content: body,
    author: article.source || "Finnhub",
    url: article.url,
    timestamp: article.datetime * 1000,
    tickers: tickers.length ? tickers : [upper],
    provider: "finnhub",
  };
}

export function normalizeCryptoPanicPost(post: CryptoPanicPost, catalog: CryptoStock[]): StoredNewsArticle | null {
  if (!post.url || !post.title) return null;

  const title = stripHtml(post.title);
  const extra: string[] = [];
  for (const currency of post.currencies ?? []) {
    const hints = CRYPTO_CURRENCY_TICKERS[currency.code.toUpperCase()] ?? [];
    extra.push(...hints);
  }

  const tickers = matchTextToTickers(title, catalog, extra);
  const summary = title.length <= 200 ? title : `${title.slice(0, 200).trim()}…`;

  return {
    id: `cryptopanic-${post.id}`,
    title,
    summary,
    content: title,
    author: post.source?.title || post.source?.domain || "CryptoPanic",
    url: post.url,
    timestamp: new Date(post.published_at).getTime() || Date.now(),
    tickers,
    provider: "cryptopanic",
  };
}

export function storedToNewsItem(article: StoredNewsArticle): NewsItem {
  const body = article.content || article.summary || article.title;
  return {
    id: article.id,
    category: "article",
    title: article.title,
    summary: article.summary,
    content: body,
    ticker: article.tickers[0],
    tickers: article.tickers,
    timestamp: article.timestamp,
    url: article.url,
    author: article.author,
    source: article.provider ?? "sosovalue",
  };
}

export function providerLabel(provider: NewsProvider | "synthetic"): string {
  switch (provider) {
    case "finnhub":
      return "Finnhub";
    case "cryptopanic":
      return "CryptoPanic";
    case "markets":
      return "Market News";
    case "crypto":
      return "Crypto";
    case "synthetic":
      return "Synthetic";
    default:
      return "SoSoValue";
  }
}

export function formatNewsDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return formatNewsDate(ts);
}

const SECONDARY_SOURCES: NewsProvider[] = ["markets", "crypto", "finnhub", "cryptopanic"];

/** Blend SoSoValue with other providers so the feed is not dominated by one source. */
export function mixNewsFeed(items: NewsItem[], limit = 100): NewsItem[] {
  const bySource = new Map<string, NewsItem[]>();
  for (const item of items) {
    const key = item.source ?? "sosovalue";
    const list = bySource.get(key) ?? [];
    list.push(item);
    bySource.set(key, list);
  }

  for (const list of bySource.values()) {
    list.sort((a, b) => b.timestamp - a.timestamp);
  }

  const soso = [...(bySource.get("sosovalue") ?? [])];
  const queues = SECONDARY_SOURCES.map((source) => [...(bySource.get(source) ?? [])]);
  const hasSecondary = queues.some((q) => q.length > 0);

  if (!hasSecondary) {
    return [...items].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  const result: NewsItem[] = [];
  let sosoIdx = 0;
  let queueIdx = 0;

  while (result.length < limit && (sosoIdx < soso.length || queues.some((q) => q.length > 0))) {
    for (let i = 0; i < 2 && sosoIdx < soso.length && result.length < limit; i++) {
      result.push(soso[sosoIdx++]);
    }

    let inserted = false;
    for (let attempt = 0; attempt < queues.length && result.length < limit; attempt++) {
      const queue = queues[(queueIdx + attempt) % queues.length];
      if (queue.length) {
        result.push(queue.shift()!);
        queueIdx = (queueIdx + attempt + 1) % queues.length;
        inserted = true;
        break;
      }
    }

    if (!inserted && sosoIdx >= soso.length) break;
  }

  const seen = new Set(result.map((item) => item.id));
  const remainder = [...queues.flat(), ...soso.slice(sosoIdx)]
    .filter((item) => !seen.has(item.id))
    .sort((a, b) => b.timestamp - a.timestamp);

  for (const item of remainder) {
    if (result.length >= limit) break;
    result.push(item);
  }

  return result;
}
