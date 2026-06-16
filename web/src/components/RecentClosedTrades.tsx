"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { CLOSED_TRADES_REFRESH_EVENT } from "@/lib/closed-trades-events";

export type ClosedTrade = {
  id: number;
  tradeType: "spot" | "perp";
  ticker: string;
  side: string | null;
  size: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  pnlUsd: number | null;
  txHash: string | null;
  closedAt: number;
};

function formatWhen(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function TradeRow({ trade }: { trade: ClosedTrade }) {
  const positive = (trade.pnlUsd ?? 0) >= 0;
  const label =
    trade.tradeType === "perp"
      ? `${trade.ticker} ${trade.side ?? "perp"}`
      : `${trade.ticker} sell`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div>
        <p className="font-mono text-sm font-semibold text-zinc-100">{label}</p>
        <p className="mt-0.5 text-[11px] text-zinc-600">
          {trade.tradeType === "perp" ? "Perp" : "Spot"} · {formatWhen(trade.closedAt)}
        </p>
      </div>
      <div className="text-right">
        {trade.exitPrice != null && (
          <p className="font-mono text-xs text-zinc-400">@${trade.exitPrice.toFixed(2)}</p>
        )}
        {trade.pnlUsd != null && (
          <p className={`font-mono text-sm font-semibold ${positive ? "text-emerald-400" : "text-rose-400"}`}>
            {positive ? "+" : ""}${trade.pnlUsd.toFixed(2)}
          </p>
        )}
        {trade.size != null && trade.tradeType === "spot" && (
          <p className="font-mono text-xs text-zinc-500">{trade.size.toFixed(4)} shares</p>
        )}
      </div>
    </div>
  );
}

export function RecentClosedTrades() {
  const { address } = useAccount();
  const [trades, setTrades] = useState<ClosedTrade[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!address) {
      setTrades([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/trades/closed/${address}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { trades?: ClosedTrade[] };
      setTrades(data.trades ?? []);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener(CLOSED_TRADES_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(CLOSED_TRADES_REFRESH_EVENT, onRefresh);
  }, [load]);

  if (!address) return null;
  if (!loading && trades.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Recent closed trades</h3>
      {loading && trades.length === 0 ? (
        <div className="h-16 animate-pulse rounded-xl bg-white/[0.03]" />
      ) : (
        trades.map((t) => <TradeRow key={t.id} trade={t} />)
      )}
    </div>
  );
}
