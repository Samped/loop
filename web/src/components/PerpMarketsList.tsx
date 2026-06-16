"use client";

import { startTransition } from "react";
import { useRouter } from "next/navigation";
import type { CryptoStock, MarketSnapshot } from "@/lib/sosovalue";

function formatVolume(value: number) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString();
}

export function PerpMarketsList({
  stocks,
  snapshots,
}: {
  stocks: CryptoStock[];
  snapshots: Record<string, MarketSnapshot>;
}) {
  const router = useRouter();

  const openPerp = (ticker: string) => {
    startTransition(() => {
      router.push(`/perp/${ticker}`);
    });
  };

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-100">Perp markets</h2>
          <p className="text-xs text-zinc-500">{stocks.length} markets · up to 20x leverage</p>
        </div>
      </div>

      <div className="glass-card overflow-hidden rounded-2xl">
        <div className="scrollbar-none overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-b border-white/[0.06] bg-[#0a0a0f]/95">
              <tr className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 text-left">Market</th>
                <th className="hidden px-4 py-3 text-left md:table-cell">Sector</th>
                <th className="px-4 py-3 text-right">Mark price</th>
                <th className="hidden px-4 py-3 text-right lg:table-cell">Volume</th>
                <th className="px-4 py-3 text-right">Max lev.</th>
                <th className="w-10 px-4 py-3" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {stocks.map((stock) => {
                const snap = snapshots[stock.ticker];
                return (
                  <tr
                    key={stock.ticker}
                    onClick={() => openPerp(stock.ticker)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openPerp(stock.ticker);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`Trade ${stock.ticker} perpetual`}
                    className="group cursor-pointer border-b border-white/[0.04] transition-all last:border-0 hover:bg-white/[0.03] focus-visible:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-xs font-bold text-zinc-400 transition-colors group-hover:bg-emerald-500/15 group-hover:text-emerald-300">
                          {stock.ticker.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-100">{stock.ticker}</p>
                          <p className="truncate text-xs text-zinc-500 max-w-[140px] sm:max-w-[200px]">
                            {stock.name}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3.5 capitalize text-xs text-zinc-500 md:table-cell">
                      {stock.sector || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-medium text-zinc-100">
                      {snap ? `$${snap.mkt_price.toFixed(2)}` : "—"}
                    </td>
                    <td className="hidden px-4 py-3.5 text-right font-mono text-xs text-zinc-500 lg:table-cell">
                      {snap?.volume ? formatVolume(snap.volume) : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        20x
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <svg
                        className="ml-auto h-4 w-4 text-zinc-600 transition-colors group-hover:text-emerald-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
