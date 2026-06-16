"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import type { PortfolioPerpPosition } from "@/lib/portfolio";
import { formatPnlUsd } from "@/lib/perp";
import { PORTFOLIO_REFRESH_EVENT } from "@/lib/balance-refresh";
import { fetchJson } from "@/lib/fetch-json";

const POLL_MS = 12_000;

function PerpPositionRow({ p }: { p: PortfolioPerpPosition }) {
  const isLong = p.side === "long";
  const pnlPositive = p.unrealizedPnl >= 0;
  const marginPct = p.margin > 0 ? (p.unrealizedPnl / p.margin) * 100 : 0;

  return (
    <Link
      href={`/perp/${p.ticker}`}
      className="glass-card-hover block rounded-xl border border-white/[0.06] p-4 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold ${
              isLong ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
            }`}
          >
            {p.ticker.slice(0, 2)}
          </div>
          <div>
            <p className="font-semibold text-zinc-100">
              {p.ticker}{" "}
              <span className={`text-xs uppercase ${isLong ? "text-emerald-400" : "text-rose-400"}`}>
                {p.side}
              </span>
            </p>
            <p className="text-xs text-zinc-500">{p.name}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-zinc-600">Equity</p>
          <p className="font-mono text-sm font-semibold text-zinc-100">${p.equity.toFixed(2)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
        <span className="text-xs text-zinc-500">Unrealized P&L</span>
        <span className={`font-mono text-sm font-medium ${pnlPositive ? "text-emerald-400" : "text-rose-400"}`}>
          {formatPnlUsd(p.unrealizedPnl)}
          <span className="ml-1.5 text-xs text-zinc-500">
            ({pnlPositive ? "+" : ""}
            {marginPct.toFixed(1)}%)
          </span>
        </span>
      </div>
      <p className="mt-2 text-[11px] text-zinc-600">
        Close now → ~${p.equity.toFixed(2)} USDC · Mark ${p.markPrice.toFixed(2)}
      </p>
    </Link>
  );
}

export function DashboardPerpPositions() {
  const { address, isConnected } = useAccount();
  const [positions, setPositions] = useState<PortfolioPerpPosition[]>([]);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (!address || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const data = await fetchJson<{ positions?: PortfolioPerpPosition[] }>(
        `/api/perp/positions/${address}`,
        10_000,
      );
      if (data) setPositions(data.positions ?? []);
    } catch {
      // keep last
    } finally {
      loadingRef.current = false;
    }
  }, [address]);

  useEffect(() => {
    if (!isConnected || !address) {
      const id = setTimeout(() => setPositions([]), 0);
      return () => clearTimeout(id);
    }
    const initial = setTimeout(() => void load(), 0);
    const interval = setInterval(() => void load(), POLL_MS);
    const onRefresh = () => void load();
    window.addEventListener(PORTFOLIO_REFRESH_EVENT, onRefresh);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      window.removeEventListener(PORTFOLIO_REFRESH_EVENT, onRefresh);
    };
  }, [address, isConnected, load]);

  if (!isConnected) return null;

  // Only show when the user has at least one open perp position.
  if (positions.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-100">Your perp positions</h2>
          <p className="text-xs text-zinc-500">Live equity & P&L</p>
        </div>
        <Link href="/perp" className="text-xs font-medium text-emerald-400 hover:text-emerald-300">
          All markets →
        </Link>
      </div>

      <div className="space-y-2">
        {positions.map((p) => (
          <PerpPositionRow key={p.ticker} p={p} />
        ))}
      </div>
    </section>
  );
}
