"use client";

import type { CryptoStock } from "@/lib/sosovalue";
import type { MarketSnapshot } from "@/lib/sosovalue";

export function Portfolio({
  stocks,
  snapshots,
  holdings,
}: {
  stocks: CryptoStock[];
  snapshots: Record<string, MarketSnapshot>;
  holdings: Record<string, bigint>;
}) {
  const positions = stocks
    .map((s) => {
      const shares = holdings[s.ticker] ?? 0n;
      if (shares === 0n) return null;
      const price = snapshots[s.ticker]?.mkt_price ?? 0;
      const sharesNum = Number(shares) / 1e18;
      const value = sharesNum * price;
      return { ...s, shares: sharesNum, value, price };
    })
    .filter(Boolean) as Array<CryptoStock & { shares: number; value: number; price: number }>;

  const totalValue = positions.reduce((sum, p) => sum + p.value, 0);

  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-100">Portfolio</h2>
          <p className="text-xs text-zinc-500">Your on-chain positions</p>
        </div>
        <p className="font-mono text-2xl font-semibold text-zinc-100">
          ${totalValue.toFixed(2)}
        </p>
      </div>

      {positions.length === 0 ? (
        <div className="glass-card rounded-2xl px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04]">
            <svg className="h-6 w-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <p className="text-sm text-zinc-400">No positions yet</p>
          <p className="mt-1 text-xs text-zinc-600">Buy your first stock to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {positions.map((p) => (
            <div
              key={p.ticker}
              className="glass-card glass-card-hover flex items-center justify-between rounded-xl px-4 py-3.5 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-sm font-bold text-emerald-400">
                  {p.ticker.slice(0, 2)}
                </div>
                <div>
                  <p className="font-semibold text-zinc-100">{p.ticker}</p>
                  <p className="text-xs text-zinc-500">
                    {p.shares.toFixed(4)} shares · ${p.price.toFixed(2)}
                  </p>
                </div>
              </div>
              <p className="font-mono text-base font-medium text-zinc-100">${p.value.toFixed(2)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
