const BASE_URL = "https://openapi.sosovalue.com/openapi/v1";

export type CryptoStock = {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  introduction: string;
  listing_time: string;
};

export type Sector = {
  sector_name: string;
  total_marketcap: number;
  change_pct_24h: number;
};

export type MarketSnapshot = {
  timestamp: number;
  ticker: string;
  mkt_price: number;
  mkt_status: string;
  volume: number;
  turnover: number;
  circulating_marketcap: number;
  total_marketcap: number;
  pe_ttm: number;
  pb: number;
};

type SosoResponse<T> = {
  code: number;
  message: string;
  data: T;
};

async function sosoFetch<T>(path: string): Promise<T> {
  const apiKey = process.env.SOSOVALUE_API_KEY;
  if (!apiKey) {
    throw new Error("SOSOVALUE_API_KEY is not configured");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "x-soso-api-key": apiKey },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`SoSoValue API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as SosoResponse<T>;
  if (json.code === 402901) {
    throw new Error("RATE_LIMIT");
  }
  if (json.code !== 0) {
    throw new Error(json.message || "SoSoValue API error");
  }
  return json.data;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

export async function getCryptoStocks(): Promise<CryptoStock[]> {
  return sosoFetch<CryptoStock[]>("/crypto-stocks");
}

export async function getSectors(): Promise<Sector[]> {
  const raw = await sosoFetch<Array<{ sector_name: string; total_marketcap: number; change_pct_24h: number }>>(
    "/crypto-stocks/sectors",
  );
  return raw.map((s) => ({
    sector_name: s.sector_name,
    total_marketcap: s.total_marketcap,
    change_pct_24h: s.change_pct_24h,
  }));
}

/** Fetch snapshots for many tickers in parallel (no inter-batch delay — for cold start). */
export async function getMarketSnapshotsParallel(
  tickers: string[],
  chunkSize = 20,
): Promise<Record<string, MarketSnapshot>> {
  const result: Record<string, MarketSnapshot> = {};

  for (let i = 0; i < tickers.length; i += chunkSize) {
    const batch = tickers.slice(i, i + chunkSize);
    const settled = await Promise.allSettled(batch.map((t) => getMarketSnapshot(t)));
    for (let j = 0; j < settled.length; j++) {
      if (settled[j].status === "fulfilled") {
        result[batch[j]!] = (settled[j] as PromiseFulfilledResult<MarketSnapshot>).value;
      }
    }
  }

  return result;
}

/** Fetch snapshots for many tickers (respects ~20 req/min rate limit) */
export async function getMarketSnapshotsBatch(tickers: string[]): Promise<Record<string, MarketSnapshot>> {
  const result: Record<string, MarketSnapshot> = {};
  const BATCH = 18;

  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    const settled = await Promise.allSettled(batch.map((t) => getMarketSnapshot(t)));
    for (let j = 0; j < settled.length; j++) {
      if (settled[j].status === "fulfilled") {
        result[batch[j]] = (settled[j] as PromiseFulfilledResult<MarketSnapshot>).value;
      }
    }
    if (i + BATCH < tickers.length) {
      await new Promise((r) => setTimeout(r, 3200));
    }
  }
  return result;
}

export async function getMarketSnapshot(ticker: string): Promise<MarketSnapshot> {
  const raw = await sosoFetch<Record<string, unknown>>(`/crypto-stocks/${ticker}/market-snapshot`);
  return {
    timestamp: toNumber(raw.timestamp),
    ticker: String(raw.ticker ?? ticker),
    mkt_price: toNumber(raw.mkt_price),
    mkt_status: String(raw.mkt_status ?? "unknown"),
    volume: toNumber(raw.volume),
    turnover: toNumber(raw.turnover),
    circulating_marketcap: toNumber(raw.circulating_marketcap),
    total_marketcap: toNumber(raw.total_marketcap),
    pe_ttm: toNumber(raw.pe_ttm),
    pb: toNumber(raw.pb),
  };
}

export type Kline = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function klineTimestampMs(ts: unknown): number {
  const n = toNumber(ts);
  if (n <= 0) return 0;
  return n < 10_000_000_000 ? n * 1000 : n;
}

export function normalizeKline(raw: Partial<Kline> & Record<string, unknown>): Kline {
  return {
    timestamp: klineTimestampMs(raw.timestamp),
    open: toNumber(raw.open),
    high: toNumber(raw.high),
    low: toNumber(raw.low),
    close: toNumber(raw.close),
    volume: toNumber(raw.volume),
  };
}

export async function getKlines(ticker: string, limit = 90): Promise<Kline[]> {
  const raw = await sosoFetch<Array<Partial<Kline> & Record<string, unknown>>>(
    `/crypto-stocks/${ticker}/klines?interval=1d&limit=${limit}`,
  );
  return raw.map(normalizeKline).filter((k) => k.timestamp > 0 && k.close > 0);
}

export type SosoNewsCurrency = {
  symbol?: string;
  name?: string;
};

export type SosoNewsArticle = {
  id: string;
  source_link: string | null;
  original_link: string | null;
  release_time: string;
  title: string | null;
  content: string | null;
  author: string | null;
  nick_name?: string | null;
  author_avatar_url?: string | null;
  matched_currencies: SosoNewsCurrency[] | null;
  tags: string[] | null;
};

type SosoNewsPage = {
  page: number;
  page_size: number;
  total: string | number;
  list: SosoNewsArticle[];
};

async function getNewsPage(path: string): Promise<SosoNewsArticle[]> {
  const data = await sosoFetch<SosoNewsPage>(path);
  return data.list ?? [];
}

export async function getNewsFeed(page = 1, pageSize = 30): Promise<SosoNewsArticle[]> {
  return getNewsPage(`/news?page=${page}&page_size=${pageSize}`);
}

export async function getHotNews(limit = 20): Promise<SosoNewsArticle[]> {
  return getNewsPage(`/news/hot?page=1&page_size=${limit}`);
}

export async function getFeaturedNews(limit = 20): Promise<SosoNewsArticle[]> {
  return getNewsPage(`/news/featured?page=1&page_size=${limit}`);
}

export async function searchNews(keyword: string, limit = 10): Promise<SosoNewsArticle[]> {
  const encoded = encodeURIComponent(keyword);
  return getNewsPage(`/news/search?keyword=${encoded}&page=1&page_size=${limit}`);
}

/** Demo klines for offline development */
export function getDemoKlines(ticker: string, limit = 90): Kline[] {
  const base = DEMO_SNAPSHOTS[ticker]?.mkt_price ?? 100;
  const now = Date.now();
  const day = 86_400_000;
  return Array.from({ length: limit }, (_, i) => {
    const drift = Math.sin(i / 8) * base * 0.08 + (i - limit / 2) * 0.05;
    const close = base + drift;
    return {
      timestamp: now - (limit - i) * day,
      open: close - 0.5,
      high: close + 1.2,
      low: close - 1.5,
      close,
      volume: 1_000_000 + i * 10_000,
    };
  });
}

/** Demo data when API key is unavailable */
export const DEMO_STOCKS: CryptoStock[] = [
  { ticker: "MSTR", name: "MicroStrategy", exchange: "NASDAQ", sector: "BTC Treasury", introduction: "", listing_time: "2023-10-11" },
  { ticker: "COIN", name: "Coinbase", exchange: "NASDAQ", sector: "Exchange", introduction: "", listing_time: "2023-10-11" },
  { ticker: "HOOD", name: "Robinhood", exchange: "NASDAQ", sector: "Exchange", introduction: "", listing_time: "2023-10-11" },
  { ticker: "TSLA", name: "Tesla", exchange: "NASDAQ", sector: "BTC Treasury", introduction: "", listing_time: "2023-10-11" },
  { ticker: "MARA", name: "MARA Holdings", exchange: "NASDAQ", sector: "Mining", introduction: "", listing_time: "2023-10-11" },
  { ticker: "RIOT", name: "Riot Platforms", exchange: "NASDAQ", sector: "Mining", introduction: "", listing_time: "2023-10-11" },
];

export const DEMO_SECTORS: Sector[] = [
  { sector_name: "all", total_marketcap: 1_901_100_000, change_pct_24h: 0.0412 },
  { sector_name: "btc treasury", total_marketcap: 890_000_000, change_pct_24h: 0.058 },
  { sector_name: "exchange", total_marketcap: 420_000_000, change_pct_24h: 0.017 },
  { sector_name: "mining", total_marketcap: 310_000_000, change_pct_24h: -0.012 },
];

export const DEMO_SNAPSHOTS: Record<string, MarketSnapshot> = {
  MSTR: { timestamp: Date.now(), ticker: "MSTR", mkt_price: 412.5, mkt_status: "open", volume: 2_400_000, turnover: 990_000_000, circulating_marketcap: 82_000_000_000, total_marketcap: 82_000_000_000, pe_ttm: 18.2, pb: 4.1 },
  COIN: { timestamp: Date.now(), ticker: "COIN", mkt_price: 245.3, mkt_status: "open", volume: 5_100_000, turnover: 1_250_000_000, circulating_marketcap: 62_000_000_000, total_marketcap: 62_000_000_000, pe_ttm: 32.1, pb: 6.8 },
  HOOD: { timestamp: Date.now(), ticker: "HOOD", mkt_price: 38.7, mkt_status: "open", volume: 8_200_000, turnover: 317_000_000, circulating_marketcap: 34_000_000_000, total_marketcap: 34_000_000_000, pe_ttm: 45.0, pb: 3.2 },
  MARA: { timestamp: Date.now(), ticker: "MARA", mkt_price: 18.4, mkt_status: "open", volume: 12_000_000, turnover: 220_000_000, circulating_marketcap: 4_800_000_000, total_marketcap: 4_800_000_000, pe_ttm: 12.5, pb: 2.1 },
  RIOT: { timestamp: Date.now(), ticker: "RIOT", mkt_price: 12.8, mkt_status: "open", volume: 9_500_000, turnover: 121_000_000, circulating_marketcap: 3_200_000_000, total_marketcap: 3_200_000_000, pe_ttm: 15.2, pb: 1.8 },
};
