import type { CryptoStock } from "@/lib/sosovalue";
import { matchTextToTickers, providerLabel, stripHtml, type NewsProvider, type StoredNewsArticle } from "@/lib/news";

export type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  guid: string;
  source?: string;
};

const AMBIGUOUS_TICKERS = new Set(["CAN", "FOR", "ALL", "ARE", "HAS", "NEW", "OLD", "TOP", "RUN", "KEY"]);

function parseRssField(block: string, tag: string): string {
  const cdata = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i"));
  if (cdata) return cdata[1].trim();
  const plain = block.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
  return plain ? plain[1].trim() : "";
}

export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRe.exec(xml))) {
    const block = match[1];
    const title = parseRssField(block, "title");
    const link = parseRssField(block, "link");
    if (!title || !link) continue;

    items.push({
      title,
      link,
      pubDate: parseRssField(block, "pubDate"),
      description: parseRssField(block, "description"),
      guid: parseRssField(block, "guid") || link,
      source: parseRssField(block, "source"),
    });
  }

  return items;
}

export function parseGoogleNewsTitle(rawTitle: string): { headline: string; source: string } {
  const title = stripHtml(rawTitle);
  const dashIdx = title.lastIndexOf(" - ");
  if (dashIdx > 20) {
    return {
      headline: title.slice(0, dashIdx).trim(),
      source: title.slice(dashIdx + 3).trim(),
    };
  }
  return { headline: title, source: "" };
}

function companyNameInHeadline(headline: string, companyName: string): boolean {
  const h = headline.toLowerCase();
  const name = companyName.toLowerCase().trim();
  if (name.length >= 4 && h.includes(name)) return true;
  const firstWord = name.split(/\s+/).find((w) => w.length >= 5);
  return Boolean(firstWord && h.includes(firstWord));
}

export function headlineMatchesTicker(headline: string, ticker: string, companyName?: string): boolean {
  const upper = ticker.toUpperCase();
  if (new RegExp(`\\b${upper}\\b`, AMBIGUOUS_TICKERS.has(upper) ? "" : "i").test(headline)) {
    return true;
  }
  if (companyName) return companyNameInHeadline(headline, companyName);
  return false;
}

function hashId(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function parseRssDate(value: string): number {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : Date.now();
}

function normalizeRssArticle(
  item: RssItem,
  provider: NewsProvider,
  catalog: CryptoStock[],
  options?: { ticker?: string; author?: string; headline?: string; body?: string },
): StoredNewsArticle | null {
  const headline = options?.headline || stripHtml(item.title);
  const body = options?.body || stripHtml(item.description || item.title);
  if (!headline || !item.link) return null;

  const summary = body.length <= 200 ? body : `${body.slice(0, 200).trim()}…`;
  const tickers = options?.ticker
    ? [options.ticker.toUpperCase()]
    : matchTextToTickers(`${headline} ${body}`, catalog);

  return {
    id: `${provider}-${hashId(item.guid)}`,
    title: headline,
    summary: summary || headline,
    content: body || headline,
    author: options?.author || item.source || providerLabel(provider),
    url: item.link,
    timestamp: parseRssDate(item.pubDate),
    tickers,
    provider,
  };
}

async function fetchRss(url: string): Promise<RssItem[]> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
  const xml = await res.text();
  return parseRssItems(xml);
}

export async function getGoogleNewsForTicker(ticker: string, limit = 12): Promise<RssItem[]> {
  if (AMBIGUOUS_TICKERS.has(ticker.toUpperCase())) return [];

  const query = encodeURIComponent(`"${ticker}" stock`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
  const items = await fetchRss(url);
  return items.slice(0, limit);
}

export async function getCoinDeskNews(limit = 25): Promise<RssItem[]> {
  const items = await fetchRss("https://www.coindesk.com/arc/outboundfeeds/rss/");
  return items.slice(0, limit);
}

export function normalizeGoogleNewsItem(
  item: RssItem,
  ticker: string,
  catalog: CryptoStock[],
  companyName?: string,
): StoredNewsArticle | null {
  const parsed = parseGoogleNewsTitle(item.title);
  if (!headlineMatchesTicker(parsed.headline, ticker, companyName)) return null;

  const author = parsed.source || (item.source ? stripHtml(item.source) : "Market News");
  const body = parsed.headline;

  return normalizeRssArticle(item, "markets", catalog, {
    ticker,
    author,
    headline: parsed.headline,
    body,
  });
}

export function normalizeCoinDeskItem(item: RssItem, catalog: CryptoStock[]): StoredNewsArticle | null {
  const headline = stripHtml(item.title);
  const body = stripHtml(item.description || item.title);
  return normalizeRssArticle(item, "crypto", catalog, {
    author: "CoinDesk",
    headline,
    body: body || headline,
  });
}

export function repairMarketsArticle(article: StoredNewsArticle): StoredNewsArticle | null {
  if (article.provider !== "markets") return article;

  const hasHtml = /<|&lt;|target=|href=/i.test(`${article.title} ${article.summary} ${article.content}`);
  const parsed = parseGoogleNewsTitle(article.title);
  const body = parsed.headline;

  if (!body) return null;

  if (!hasHtml && article.content === body && article.summary && !article.summary.includes("<")) {
    return article;
  }

  const summary = body.length <= 200 ? body : `${body.slice(0, 200).trim()}…`;
  return {
    ...article,
    title: body,
    summary,
    content: body,
    author: parsed.source || article.author,
  };
}
