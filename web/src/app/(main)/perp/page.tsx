"use client";

import { useEffect, useState } from "react";
import type { CryptoStock, MarketSnapshot } from "@/lib/sosovalue";
import { PERP_MARKET_TICKERS } from "@/lib/perp-markets";
import { PerpMarketsList } from "@/components/PerpMarketsList";
import { fetchJson } from "@/lib/fetch-json";

const POLL_MS = 5_000;

export default function PerpMarketsPage() {
  const [stocks, setStocks] = useState<CryptoStock[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, MarketSnapshot>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [stocksRes, snapsRes] = await Promise.all([
        fetchJson<{ stocks?: CryptoStock[] }>("/api/market/stocks"),
        fetchJson<{ snapshots?: Record<string, MarketSnapshot> }>("/api/market/snapshots"),
      ]);
      if (cancelled) return;

      const all = stocksRes?.stocks ?? [];
      const perpSet = new Set<string>(PERP_MARKET_TICKERS);
      const byTicker = new Map(all.map((s) => [s.ticker, s]));
      const perpStocks = PERP_MARKET_TICKERS.map(
        (ticker) =>
          byTicker.get(ticker) ?? {
            ticker,
            name: ticker,
            exchange: "",
            sector: "",
            introduction: "",
            listing_time: "",
          },
      );
      setStocks(perpStocks.filter((s) => perpSet.has(s.ticker)));
      setSnapshots(snapsRes?.snapshots ?? {});
      setLoading(false);
    }

    void load();
    const interval = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-8">
        <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-400/80">
          Arc Testnet · Perpetuals
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-100">Stock perp markets</h1>
      </header>

      {loading ? (
        <div className="glass-card flex flex-col items-center justify-center rounded-2xl py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
          <p className="mt-4 text-sm text-zinc-500">Loading markets…</p>
        </div>
      ) : (
        <PerpMarketsList stocks={stocks} snapshots={snapshots} />
      )}
    </div>
  );
}
