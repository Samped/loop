"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CryptoStock, MarketSnapshot, Sector } from "@/lib/sosovalue";
import { SectorCards } from "@/components/SectorCards";
import { StockList } from "@/components/StockList";
import { DashboardStatCard, PerpPromoCard } from "@/components/PerpPromoCard";
import { DashboardPerpPositions } from "@/components/DashboardPerpPositions";

export function Dashboard() {
  const [catalog, setCatalog] = useState<CryptoStock[]>([]);
  const [chartReady, setChartReady] = useState<Set<string>>(new Set());
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, MarketSnapshot>>({});
  const [marketSource, setMarketSource] = useState("demo");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [priceTotal, setPriceTotal] = useState(0);
  const [pricesRefreshing, setPricesRefreshing] = useState(false);

  const loadMarketData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch("/api/market/bootstrap", { signal: controller.signal });
      if (!res.ok) throw new Error(`bootstrap ${res.status}`);
      const bootstrapRes = await res.json();

      const allStocks: CryptoStock[] = bootstrapRes.allStocks ?? bootstrapRes.stocks ?? [];
      if (allStocks.length === 0) throw new Error("empty catalog");

      setCatalog(allStocks);
      setChartReady(new Set((bootstrapRes.chartReady as string[] | undefined) ?? []));
      setSectors(bootstrapRes.sectors ?? []);
      setMarketSource(bootstrapRes.marketSource ?? "demo");
      setSnapshots(bootstrapRes.snapshots ?? {});
      setPriceTotal(bootstrapRes.priceTotal ?? allStocks.length);
      setPricesRefreshing(bootstrapRes.pricesRefreshing === true);
    } catch {
      setLoadError(true);
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

    const poll = async () => {
      try {
        const res = await fetch("/api/market/snapshots");
        if (!res.ok) return;
        const data = (await res.json()) as {
          snapshots?: Record<string, MarketSnapshot>;
          total?: number;
          refreshing?: boolean;
        };
        if (data.snapshots) setSnapshots(data.snapshots);
        if (data.total != null) setPriceTotal(data.total);
        setPricesRefreshing(data.refreshing === true);
      } catch {
        setPricesRefreshing(false);
      }
    };

    const id = setInterval(() => void poll(), 4_000);
    void poll();
    return () => clearInterval(id);
  }, [loading, pricesRefreshing]);

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
        : loadError
          ? "Could not refresh live feed"
          : `${pricedCount} prices live`;

  const syncProgress =
    pricesRefreshing && pricedCount < priceTotal
      ? Math.min(100, (pricedCount / Math.max(priceTotal, 1)) * 100)
      : 100;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {loading ? (
        <div className="flex flex-col items-center justify-center py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
          <p className="mt-4 text-sm text-zinc-500">Loading markets…</p>
        </div>
      ) : loadError && catalog.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32">
          <p className="text-sm text-zinc-500">Could not load markets.</p>
          <button
            type="button"
            onClick={() => void loadMarketData()}
            className="mt-4 rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-sm text-zinc-300 hover:bg-white/[0.08]"
          >
            Retry
          </button>
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
            stocks={catalog}
            snapshots={snapshots}
            chartReady={chartReady}
            syncing={pricesRefreshing && pricedCount < priceTotal}
            priceTotal={priceTotal}
            onRetry={loadError ? loadMarketData : undefined}
          />
        </div>
      )}
    </div>
  );
}
