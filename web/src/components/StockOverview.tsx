"use client";

import type { CryptoStock, MarketSnapshot } from "@/lib/sosovalue";

function formatCap(value: number) {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
}

function formatVolume(value: number) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString();
}

function formatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function StockOverview({
  stock,
  snapshot,
}: {
  stock: CryptoStock;
  snapshot: MarketSnapshot | null;
}) {
  const metrics = snapshot
    ? [
        { label: "Price", value: `$${snapshot.mkt_price.toFixed(2)}` },
        { label: "Status", value: snapshot.mkt_status },
        { label: "Volume", value: formatVolume(snapshot.volume) },
        { label: "Turnover", value: formatCap(snapshot.turnover) },
        { label: "Market Cap", value: formatCap(snapshot.total_marketcap) },
        { label: "Circ. Cap", value: formatCap(snapshot.circulating_marketcap) },
        { label: "P/E (TTM)", value: snapshot.pe_ttm ? snapshot.pe_ttm.toFixed(1) : "—" },
        { label: "P/B", value: snapshot.pb ? snapshot.pb.toFixed(1) : "—" },
      ]
    : [];

  return (
    <section className="space-y-4">
      <div className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {stock.exchange && (
            <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              {stock.exchange}
            </span>
          )}
          {stock.sector && (
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium capitalize text-emerald-400">
              {stock.sector}
            </span>
          )}
          {stock.listing_time && (
            <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-500">
              Listed {formatDate(stock.listing_time)}
            </span>
          )}
        </div>

        <h2 className="text-lg font-semibold text-zinc-100">About {stock.name}</h2>
        {stock.introduction ? (
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">{stock.introduction}</p>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">
            {stock.name} ({stock.ticker}) is a tokenized equity on SoSoValue&apos;s crypto stock index.
            {stock.sector ? ` Sector: ${stock.sector}.` : ""}
            {stock.exchange ? ` Traded on ${stock.exchange}.` : ""}
          </p>
        )}
      </div>

      {metrics.length > 0 && (
        <div className="glass-card rounded-2xl p-5 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Key Statistics
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-white/[0.02] px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">{label}</p>
                <p className="mt-1 font-mono text-sm font-medium capitalize text-zinc-200">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
