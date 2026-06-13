"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CryptoStock, MarketSnapshot } from "@/lib/sosovalue";

function formatCap(value: number) {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
}

function formatVolume(value: number) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString();
}

export function StockList({
  stocks,
  snapshots,
  chartReady,
}: {
  stocks: CryptoStock[];
  snapshots: Record<string, MarketSnapshot>;
  chartReady: Set<string>;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filtered = stocks.filter(
    (s) =>
      s.ticker.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase()),
  );

  const openStock = (ticker: string) => {
    router.push(`/stock/${ticker}`);
  };

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-100">Markets</h2>
          <p className="text-xs text-zinc-500">{stocks.length} stocks with live data</p>
        </div>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search ticker or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none transition-colors focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 sm:w-64"
          />
        </div>
      </div>

      {stocks.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center rounded-2xl py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
          <p className="mt-4 text-sm text-zinc-500">Loading stock prices…</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden rounded-2xl">
          <div className="scrollbar-none max-h-[560px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#0a0a0f]/95 backdrop-blur-sm">
                <tr className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-3 text-left">Asset</th>
                  <th className="hidden px-4 py-3 text-left md:table-cell">Sector</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="hidden px-4 py-3 text-right lg:table-cell">Volume</th>
                  <th className="hidden px-4 py-3 text-right xl:table-cell">Mkt Cap</th>
                  <th className="w-10 px-4 py-3" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {filtered.map((stock) => {
                  const snap = snapshots[stock.ticker];
                  const hasChart = chartReady.has(stock.ticker);

                  return (
                    <tr
                      key={stock.ticker}
                      onClick={() => openStock(stock.ticker)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openStock(stock.ticker);
                        }
                      }}
                      tabIndex={0}
                      role="link"
                      aria-label={`View ${stock.ticker} chart and details`}
                      className="group cursor-pointer border-b border-white/[0.04] transition-all last:border-0 hover:bg-white/[0.03] focus-visible:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-xs font-bold text-zinc-400 transition-colors group-hover:bg-emerald-500/15 group-hover:text-emerald-300">
                            {stock.ticker.slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-zinc-100">{stock.ticker}</p>
                            <p className="truncate text-xs text-zinc-500 max-w-[140px] sm:max-w-[200px]">{stock.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3.5 capitalize text-xs text-zinc-500 md:table-cell">
                        {stock.sector}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-medium text-zinc-100">
                        {snap ? `$${snap.mkt_price.toFixed(2)}` : "—"}
                      </td>
                      <td className="hidden px-4 py-3.5 text-right font-mono text-xs text-zinc-500 lg:table-cell">
                        {snap?.volume ? formatVolume(snap.volume) : "—"}
                      </td>
                      <td className="hidden px-4 py-3.5 text-right font-mono text-xs text-zinc-500 xl:table-cell">
                        {snap?.total_marketcap ? formatCap(snap.total_marketcap) : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {hasChart ? (
                          <svg
                            className="ml-auto h-4 w-4 text-zinc-600 transition-colors group-hover:text-emerald-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        ) : (
                          <span className="text-xs text-zinc-600 animate-pulse-soft">…</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
