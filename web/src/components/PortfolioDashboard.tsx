"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import type { PortfolioData, PortfolioPerpPosition, PortfolioPosition } from "@/lib/portfolio";
import { BALANCE_REFETCH_MS, PORTFOLIO_REFRESH_EVENT } from "@/lib/balance-refresh";
import { PortfolioChart } from "@/components/PortfolioChart";
import { useMounted } from "@/hooks/useMounted";

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function StatBox({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white/[0.02] px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">{label}</p>
      <p
        className={`mt-1 font-mono text-lg font-semibold ${
          positive === true
            ? "text-emerald-400"
            : positive === false
              ? "text-rose-400"
              : "text-zinc-100"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 28;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-20">
      <polyline
        fill="none"
        stroke={positive ? "#34d399" : "#fb7185"}
        strokeWidth="1.5"
        strokeLinecap="round"
        points={pts}
      />
    </svg>
  );
}

function PositionCard({ p }: { p: PortfolioPosition }) {
  const positive = p.dayChangePct >= 0;
  return (
    <Link
      href={`/stock/${p.ticker}`}
      className="glass-card-hover block rounded-xl p-4 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-sm font-bold text-emerald-400">
            {p.ticker.slice(0, 2)}
          </div>
          <div>
            <p className="font-semibold text-zinc-100">{p.ticker}</p>
            <p className="text-xs text-zinc-500">{p.name}</p>
          </div>
        </div>
        <Sparkline data={p.sparkline} positive={p.periodChangePct >= 0} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-600">Value</p>
          <p className="font-mono text-sm font-medium text-zinc-100">${p.value.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-600">Shares</p>
          <p className="font-mono text-sm text-zinc-300">{p.shares.toFixed(4)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-600">Today</p>
          <p className={`font-mono text-sm font-medium ${positive ? "text-emerald-400" : "text-rose-400"}`}>
            {p.dayPnl >= 0 ? "+" : ""}${p.dayPnl.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-600">Period</p>
          <p className={`font-mono text-sm font-medium ${p.periodChangePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {p.periodChangePct >= 0 ? "+" : ""}
            {p.periodChangePct.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
        <div
          className="h-full rounded-full bg-emerald-500/50"
          style={{ width: `${p.allocation}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] text-zinc-600">{p.allocation.toFixed(1)}% of portfolio</p>
    </Link>
  );
}

function PerpPositionCard({ p }: { p: PortfolioPerpPosition }) {
  const isLong = p.side === "long";
  return (
    <Link
      href={`/perp/${p.ticker}`}
      className="glass-card-hover block rounded-xl p-4 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold ${
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
        <p className="font-mono text-sm font-medium text-zinc-100">${p.equity.toFixed(2)}</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-600">Margin</p>
          <p className="font-mono text-zinc-300">${p.margin.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-600">P&L</p>
          <p className={`font-mono ${p.unrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {p.unrealizedPnl >= 0 ? "+" : ""}${p.unrealizedPnl.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-600">Entry</p>
          <p className="font-mono text-zinc-300">${p.entryPrice.toFixed(2)}</p>
        </div>
      </div>
    </Link>
  );
}

export function PortfolioDashboard({ refreshKey = 0 }: { refreshKey?: number }) {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!address) {
      setPortfolio(null);
      return;
    }
    if (!opts?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(`/api/portfolio/${address}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load portfolio");
      setPortfolio(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load portfolio");
      if (!opts?.silent) setPortfolio(null);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load, refreshKey]);

  useEffect(() => {
    if (!address) return;
    const interval = setInterval(() => {
      void load({ silent: true });
    }, BALANCE_REFETCH_MS);
    const onRefresh = () => void load({ silent: true });
    window.addEventListener(PORTFOLIO_REFRESH_EVENT, onRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener(PORTFOLIO_REFRESH_EVENT, onRefresh);
    };
  }, [address, load]);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!mounted) {
    return (
      <section className="space-y-4">
        <div className="glass-card rounded-2xl p-5 sm:p-6">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">Total Value</p>
          <div className="mt-2 h-9 w-32 animate-pulse rounded-lg bg-white/[0.04]" />
        </div>
      </section>
    );
  }

  if (!isConnected) {
    return (
      <section className="glass-card rounded-2xl p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-zinc-100">Your Portfolio</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Connect your wallet to see USDC-reserved holdings on Arc Testnet.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">Total Value</p>
            {loading && !portfolio ? (
              <div className="mt-2 h-9 w-32 animate-pulse rounded-lg bg-white/[0.04]" />
            ) : (
              <p className="mt-1 font-mono text-3xl font-bold text-zinc-100">
                ${(portfolio?.totalValue ?? 0).toFixed(2)}
              </p>
            )}
            {portfolio?.reserve.configured && (
              <p className="mt-1 text-xs text-emerald-400/80">
                USDC vault · ${portfolio.reserve.reserveUsdc.toFixed(2)} reserve
                {portfolio.reserve.liabilities > 0 && (
                  <span className="text-zinc-500">
                    {" "}
                    · {portfolio.reserve.reserveRatioPct.toFixed(0)}% collateralized
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="font-mono text-xs text-zinc-400">{shortenAddress(address!)}</span>
              <button onClick={copyAddress} className="text-[10px] text-zinc-600 hover:text-zinc-400">
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-400">{error}</p>
        )}

        {portfolio && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatBox
              label="Today's P&L"
              value={`${portfolio.totalDayPnl >= 0 ? "+" : ""}$${portfolio.totalDayPnl.toFixed(2)}`}
              sub={`${portfolio.totalDayPnlPct >= 0 ? "+" : ""}${portfolio.totalDayPnlPct.toFixed(2)}%`}
              positive={portfolio.totalDayPnl >= 0}
            />
            <StatBox
              label="Period P&L"
              value={`${portfolio.periodPnl >= 0 ? "+" : ""}$${portfolio.periodPnl.toFixed(2)}`}
              sub={`${portfolio.periodPnlPct >= 0 ? "+" : ""}${portfolio.periodPnlPct.toFixed(2)}%`}
              positive={portfolio.periodPnl >= 0}
            />
            <StatBox
              label="Cash (USDC)"
              value={`$${portfolio.usdcBalance.toFixed(2)}`}
              sub="Available on Arc · live"
            />
            <StatBox
              label="Positions"
              value={`${portfolio.positions.length}`}
              sub={portfolio.positions.length === 1 ? "stock held" : "stocks held"}
            />
          </div>
        )}
      </div>

      {loading && !portfolio && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
          Loading holdings…
        </div>
      )}

      {portfolio && portfolio.history.length >= 2 && (
        <div className="glass-card rounded-2xl p-5 sm:p-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Portfolio Performance
          </h3>
          <PortfolioChart
            history={portfolio.history}
            totalInvested={portfolio.history[0]?.value ?? 0}
          />
          <p className="mt-2 text-[11px] text-zinc-600">
            USDC-reserved synthetic shares on Arc · dashed line = start of period
          </p>
        </div>
      )}

      {portfolio && portfolio.positions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Holdings · Arc Testnet
          </h3>
          {portfolio.positions.map((p) => (
            <PositionCard key={p.ticker} p={p} />
          ))}
        </div>
      )}

      {portfolio && portfolio.positions.length === 0 && !loading && (
        <div className="glass-card rounded-2xl px-6 py-12 text-center">
          <p className="text-sm text-zinc-400">No stock positions yet.</p>
          <p className="mt-1 text-xs text-zinc-600">Trade on Arc — shares backed by the on-chain USDC vault</p>
          <Link href="/" className="mt-3 inline-block text-sm font-medium text-emerald-400 hover:text-emerald-300">
            Go to Markets to buy →
          </Link>
        </div>
      )}

      {portfolio && (portfolio.perpPositions?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Perp Positions · Arc Testnet
          </h3>
          {portfolio.perpPositions.map((p) => (
            <PerpPositionCard key={p.ticker} p={p} />
          ))}
        </div>
      )}
    </section>
  );
}
