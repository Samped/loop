import { NextResponse } from "next/server";
import { getCachedCryptoStocks, getCachedSectors } from "@/lib/market-data";
import type { NewsItem } from "@/lib/news";
import { mixNewsFeed, storedToNewsItem } from "@/lib/news";
import { getProviderCounts, getStoredNewsArticles, hydrateNewsStore } from "@/lib/news-store";
import { getNewsSyncStatus, requestNewsSync, startNewsSyncer, syncNewsNow } from "@/lib/news-syncer";
import { getStoredKlines, getStoredSnapshots, getStoredSectors, getStoredStocks, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { filterListedSnapshots } from "@/lib/stock-ready";
import { rateLimit } from "@/lib/api-guard";
import { withTimeout } from "@/lib/async-timeout";

function formatPct(value: number) {
  const pct = value * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

async function buildSyntheticNews(): Promise<NewsItem[]> {
  const items: NewsItem[] = [];
  const now = Date.now();

  try {
    const sectors = getStoredSectors() ?? [];
    const stocks = getStoredStocks() ?? [];
    const snapshots = filterListedSnapshots(getStoredSnapshots());

    for (const sector of sectors.filter((s) => s.sector_name !== "all")) {
      const positive = sector.change_pct_24h >= 0;
      items.push({
        id: `sector-${sector.sector_name}`,
        category: "sector",
        title: `${sector.sector_name} sector ${positive ? "rallies" : "pulls back"}`,
        summary: `Crypto stocks in ${sector.sector_name} moved ${formatPct(sector.change_pct_24h)} over 24h. Total sector market cap: $${(sector.total_marketcap / 1e9).toFixed(2)}B.`,
        changePct: sector.change_pct_24h * 100,
        timestamp: now,
        source: "synthetic",
      });
    }

    const movers: Array<{ ticker: string; name: string; changePct: number; price: number }> = [];

    for (const stock of stocks) {
      const klines = getStoredKlines(stock.ticker);
      const snap = snapshots[stock.ticker];
      if (!klines || klines.length < 2 || !snap) continue;

      const last = klines[klines.length - 1].close;
      const prev = klines[klines.length - 2].close;
      const changePct = prev > 0 ? ((last - prev) / prev) * 100 : 0;
      movers.push({ ticker: stock.ticker, name: stock.name, changePct, price: snap.mkt_price });
    }

    movers.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

    for (const m of movers.slice(0, 8)) {
      items.push({
        id: `stock-${m.ticker}`,
        category: "stock",
        title: `${m.ticker} ${m.changePct >= 0 ? "gains" : "drops"} ${Math.abs(m.changePct).toFixed(2)}%`,
        summary: `${m.name} is trading at $${m.price.toFixed(2)}. ${m.changePct >= 0 ? "Bulls pushing higher in today's session." : "Selling pressure seen in recent price action."}`,
        ticker: m.ticker,
        changePct: m.changePct,
        timestamp: now - Math.random() * 3_600_000,
        source: "synthetic",
      });
    }

    items.push({
      id: "market-overview",
      category: "market",
      title: `${Object.keys(snapshots).length} crypto stocks with live prices`,
      summary: `Loop tracks ${stocks.length} tokenized equities. ${movers.length} tickers have chart data for daily moves. Trade on Arc Testnet with USDC settlement.`,
      timestamp: now,
      source: "synthetic",
    });
  } catch {
    items.push({
      id: "market-offline",
      category: "market",
      title: "Market data syncing",
      summary: "News feed will populate once SoSoValue market data finishes loading.",
      timestamp: now,
      source: "synthetic",
    });
  }

  return items;
}

export async function GET(req: Request) {
  const limited = rateLimit(req, "api:news-get", 120, 60_000);
  if (limited) return limited;

  hydrateSnapshotStore();
  hydrateNewsStore();
  startNewsSyncer();

  const force = new URL(req.url).searchParams.get("refresh") === "1";
  requestNewsSync({ force, tickerSearch: false });

  const hasNewsKeys = Boolean(
    process.env.SOSOVALUE_API_KEY || process.env.FINNHUB_API_KEY || process.env.CRYPTOPANIC_API_KEY,
  );

  if (hasNewsKeys && getStoredNewsArticles(1).length === 0) {
    await withTimeout(syncNewsNow({ tickerSearch: false }), 18_000);
  }

  const stored = getStoredNewsArticles(500)
    .map(storedToNewsItem)
    .filter((item) => item.category === "article" && item.source && item.source !== "synthetic");

  const synthetic = !hasNewsKeys && stored.length === 0 ? await buildSyntheticNews() : [];
  const items = mixNewsFeed([...stored, ...synthetic], 300);
  const status = getNewsSyncStatus();

  return NextResponse.json({
    items,
    source: stored.length ? "multi" : hasNewsKeys ? "syncing" : "synthetic",
    articleCount: stored.length,
    providerCounts: getProviderCounts(),
    sync: status,
  });
}
