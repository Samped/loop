"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CryptoStock, Kline, MarketSnapshot } from "@/lib/sosovalue";
import type { NewsItem } from "@/lib/news";
import { PriceChart } from "@/components/PriceChart";
import { StockOverview } from "@/components/StockOverview";
import { TradePanel } from "@/components/TradePanel";
import { NewsFeed } from "@/components/NewsFeed";

export function StockDetail({ ticker }: { ticker: string }) {
  const upper = ticker.toUpperCase();
  const [stock, setStock] = useState<CryptoStock | null>(null);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [klines, setKlines] = useState<Kline[]>([]);
  const [source, setSource] = useState("sosovalue");
  const [loading, setLoading] = useState(true);
  const [chartReady, setChartReady] = useState(false);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setChartReady(false);
      try {
        const [stockRes, snapRes, klinesRes] = await Promise.all([
          fetch(`/api/market/stock/${upper}`).then((r) => r.json()),
          fetch(`/api/market/snapshot/${upper}`).then((r) => r.json()),
          fetch(`/api/market/klines/${upper}?limit=180`).then((r) => r.json()),
        ]);

        setStock(
          stockRes.stock ?? {
            ticker: upper,
            name: upper,
            exchange: "",
            sector: "",
            introduction: "",
            listing_time: "",
          },
        );
        setSnapshot(snapRes.snapshot ?? null);

        if (klinesRes.klines?.length) {
          setKlines(klinesRes.klines);
          setChartReady(true);
          setSource(klinesRes.source ?? "sosovalue");
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [upper]);

  useEffect(() => {
    const id = setTimeout(() => {
      setNewsLoading(true);
      fetch(`/api/news/stock/${upper}`)
        .then((r) => r.json())
        .then((data) => setNews(data.items ?? []))
        .finally(() => setNewsLoading(false));
    }, 0);
    return () => clearTimeout(id);
  }, [upper]);

  const stockInfo = stock ?? {
    ticker: upper,
    name: upper,
    exchange: "",
    sector: "",
    introduction: "",
    listing_time: "",
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to markets
      </Link>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
            <p className="mt-4 text-sm text-zinc-500">Loading stock data…</p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
            <div className="space-y-6 lg:col-span-3">
              {chartReady ? (
                <div className="glass-card rounded-2xl p-5 sm:p-6">
                  <PriceChart klines={klines} ticker={upper} />
                  <p className="mt-3 text-[11px] text-zinc-600">
                    Hover chart for OHLCV · Data via {source === "sosovalue" ? "SoSoValue" : source}
                  </p>
                </div>
              ) : (
                <div className="glass-card rounded-2xl px-6 py-10 text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
                  <p className="mt-4 text-sm text-zinc-400">{upper} chart is still syncing.</p>
                  <Link
                    href="/"
                    className="mt-3 inline-flex text-sm font-medium text-emerald-400 hover:text-emerald-300"
                  >
                    ← Back to markets
                  </Link>
                </div>
              )}

              <StockOverview stock={stockInfo} snapshot={snapshot} />

              <div>
                <div className="mb-3 flex items-center justify-between px-1">
                  <h3 className="text-sm font-medium text-zinc-300">{upper} news</h3>
                  <Link href="/news" className="text-[11px] text-zinc-600 hover:text-zinc-400">
                    All news
                  </Link>
                </div>
                <NewsFeed
                  items={news.slice(0, 5)}
                  loading={newsLoading}
                  compact
                  emptyMessage={`No recent headlines for ${upper}.`}
                />
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-24">
                <TradePanel
                  ticker={upper}
                  snapshot={snapshot}
                  onTradeComplete={() => {}}
                />
              </div>
            </div>
          </div>
        )}
      </div>
  );
}
