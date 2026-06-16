"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CryptoStock, MarketSnapshot, Sector } from "@/lib/sosovalue";
import { SectorCards } from "@/components/SectorCards";
import { StockList } from "@/components/StockList";
import { DashboardStatCard, PerpPromoCard } from "@/components/PerpPromoCard";
import { DashboardPerpPositions } from "@/components/DashboardPerpPositions";

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch("/api/market/bootstrap", { signal: controller.signal });
      if (!res.ok) return;
      const bootstrapRes = await res.json();

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
    } catch {
      // Show UI with empty/demo state rather than infinite spinner
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void loadMarketData(), 0);
    return () => clearTimeout(id);
  }, [loadMarketData]);

  useEffect(() => {
    if (loading || !pricesRefreshing) return;
    if (priceTotal > 0 && listedTickers.size >= priceTotal) return;

    const poll = async () => {
      try {
        const res = await fetch("/api/market/snapshots");
        if (!res.ok) return;
        const data = (await res.json()) as {
          snapshots?: Record<string, MarketSnapshot>;
          count?: number;
          total?: number;
          refreshing?: boolean;
        };
        if (data.snapshots) {
          setSnapshots(data.snapshots);
          const withPrice = Object.entries(data.snapshots)
            .filter(([, snap]) => snap.mkt_price > 0 && snap.total_marketcap > 0)
            .map(([ticker]) => ticker);
          setListedTickers(new Set(withPrice));
        }
        if (data.total != null) setPriceTotal(data.total);
        setPricesRefreshing(data.refreshing === true);
      } catch {
        // keep polling
      }
    };

    const id = setInterval(() => void poll(), 3_000);
    void poll();
    return () => clearInterval(id);
  }, [loading, pricesRefreshing, listedTickers.size, priceTotal]);

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

  const pricedCount = useMemo(
    () =>
      catalog.filter((s) => {
        const snap = snapshots[s.ticker];
        return Boolean(snap && snap.mkt_price > 0 && snap.total_marketcap > 0);
      }).length,
    [catalog, snapshots],
  );

  const liveSub =
    pricesRefreshing && pricedCount < priceTotal
      ? `Syncing ${pricedCount} of ${priceTotal}`
      : chartReady.size > 0
        ? `${chartReady.size} charts ready`
        : "Charts syncing";

  const syncProgress =
    pricesRefreshing && pricedCount < priceTotal
      ? Math.min(100, (pricedCount / priceTotal) * 100)
      : 100;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {loading ? (
        <div className="flex flex-col items-center justify-center py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
          <p className="mt-4 text-sm text-zinc-500">Loading markets…</p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2">
            <DashboardStatCard
              label="Live Prices"
              value={`${pricedCount} stocks`}
              sub={liveSub}
              accent="emerald"
              footer={
                <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-emerald-500/50 transition-all duration-700 ease-out"
                    style={{ width: `${syncProgress}%` }}
                  />
                </div>
              }
            />
            <PerpPromoCard />
          </div>

          <DashboardPerpPositions />

          <SectorCards sectors={sectors} source={marketSource} />

          <StockList
            stocks={catalog.length > 0 ? catalog : listedStocks}
            snapshots={snapshots}
            chartReady={chartReady}
            syncing={pricesRefreshing && pricedCount < priceTotal}
            priceTotal={priceTotal}
          />
        </div>
      )}
    </div>
  );
}
