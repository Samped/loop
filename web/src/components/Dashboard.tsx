"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CryptoStock, MarketSnapshot, Sector } from "@/lib/sosovalue";
import { SectorCards } from "@/components/SectorCards";
import { StockList } from "@/components/StockList";

function StatPill({ label, value, sub, status }: { label: string; value: string; sub?: string; status?: "ok" | "warn" }) {
  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1.5 text-base font-semibold sm:text-lg ${status === "warn" ? "text-amber-400" : "text-zinc-100"}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

export function Dashboard() {
  const [catalog, setCatalog] = useState<CryptoStock[]>([]);
  const [listedTickers, setListedTickers] = useState<Set<string>>(new Set());
  const [chartReady, setChartReady] = useState<Set<string>>(new Set());
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, MarketSnapshot>>({});
  const [marketSource, setMarketSource] = useState("demo");
  const [loading, setLoading] = useState(true);
  const [priceTotal, setPriceTotal] = useState(0);
  const [pricesRefreshing, setPricesRefreshing] = useState(false);

  const listedStocks = useMemo(
    () => catalog.filter((s) => listedTickers.has(s.ticker)),
    [catalog, listedTickers],
  );

  const loadMarketData = useCallback(async () => {
    setLoading(true);
    try {
      const bootstrapRes = await fetch("/api/market/bootstrap").then((r) => r.json());

      const allStocks: CryptoStock[] = bootstrapRes.allStocks ?? bootstrapRes.stocks ?? [];
      const initialListed: CryptoStock[] = bootstrapRes.stocks ?? [];

      setCatalog(allStocks);
      setListedTickers(new Set(initialListed.map((s) => s.ticker)));
      setChartReady(new Set((bootstrapRes.chartReady as string[] | undefined) ?? []));
      setSectors(bootstrapRes.sectors ?? []);
      setMarketSource(bootstrapRes.marketSource ?? "demo");
      setSnapshots(bootstrapRes.snapshots ?? {});
      setPriceTotal(bootstrapRes.priceTotal ?? allStocks.length);
      setPricesRefreshing(bootstrapRes.pricesRefreshing === true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMarketData();
  }, [loadMarketData]);

  useEffect(() => {
    if (loading) return;

    const es = new EventSource("/api/market/prices/stream");

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type?: string;
          ticker?: string;
          tickers?: string[];
          snapshot?: MarketSnapshot;
          snapshots?: Record<string, MarketSnapshot>;
          count?: number;
          total?: number;
        };

        if (data.type === "listed_batch" && data.tickers) {
          setListedTickers(new Set(data.tickers));
          if (data.snapshots) setSnapshots(data.snapshots);
          setPriceTotal(data.total ?? data.tickers.length);
        }

        if (data.type === "chart_batch" && data.tickers) {
          setChartReady(new Set(data.tickers));
        }

        if (data.type === "listed" && data.ticker) {
          setListedTickers((prev) => new Set([...prev, data.ticker!]));
          if (data.snapshot) {
            setSnapshots((prev) => ({ ...prev, [data.ticker!]: data.snapshot! }));
          }
        }

        if (data.type === "chart" && data.ticker) {
          setChartReady((prev) => new Set([...prev, data.ticker!]));
        }

        if (data.total != null && data.count != null) {
          setPricesRefreshing(data.count < data.total);
        }
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      es.close();
      setPricesRefreshing(false);
    };

    return () => es.close();
  }, [loading]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {loading ? (
        <div className="flex flex-col items-center justify-center py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
          <p className="mt-4 text-sm text-zinc-500">Loading markets…</p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="max-w-xs">
              <StatPill
                label="Live Prices"
                value={`${listedStocks.length} stocks`}
                sub={
                  pricesRefreshing && listedStocks.length < priceTotal
                    ? `Syncing ${listedStocks.length} of ${priceTotal}`
                    : chartReady.size > 0
                      ? `${chartReady.size} charts ready`
                      : "Charts syncing"
                }
              />
              {pricesRefreshing && listedStocks.length < priceTotal && (
                <div className="mt-2 h-px overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-emerald-500/40 transition-all duration-700 ease-out"
                    style={{ width: `${Math.min(100, (listedStocks.length / priceTotal) * 100)}%` }}
                  />
                </div>
              )}
            </div>

            <SectorCards sectors={sectors} source={marketSource} />

            <StockList
              stocks={listedStocks}
              snapshots={snapshots}
              chartReady={chartReady}
            />
        </div>
      )}
    </div>
  );
}
