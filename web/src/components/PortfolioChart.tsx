"use client";

import { useMemo, useState } from "react";
import type { PortfolioHistoryPoint } from "@/lib/portfolio";

type Range = "1W" | "1M" | "3M" | "ALL";

const RANGE_DAYS: Record<Range, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
  ALL: Infinity,
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function PortfolioChart({
  history,
  totalInvested,
}: {
  history: PortfolioHistoryPoint[];
  totalInvested: number;
}) {
  const [range, setRange] = useState<Range>("1M");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const days = RANGE_DAYS[range];
    if (days === Infinity) return history;
    return history.slice(-days);
  }, [history, range]);

  if (filtered.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl bg-white/[0.02] text-sm text-zinc-600">
        {history.length === 0
          ? "Buy stocks to track portfolio performance"
          : "More chart data syncing…"}
      </div>
    );
  }

  const activeIndex = hoverIndex ?? filtered.length - 1;
  const active = filtered[activeIndex];
  const values = filtered.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rangeVal = max - min || 1;

  const width = 600;
  const height = 200;
  const pad = 12;

  const xAt = (i: number) => pad + (i / (filtered.length - 1)) * (width - pad * 2);
  const yAt = (v: number) => pad + (1 - (v - min) / rangeVal) * (height - pad * 2);
  const points = values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");

  const first = filtered[0].value;
  const display = active.value;
  const change = ((display - first) / first) * 100;
  const vsInvested = totalInvested > 0 ? ((display - totalInvested) / totalInvested) * 100 : 0;
  const positive = change >= 0;
  const strokeColor = positive ? "#34d399" : "#fb7185";
  const gradId = "portfolioGrad";

  const handlePointer = (clientX: number, rect: DOMRect) => {
    const ratio = (clientX - rect.left) / rect.width;
    const index = Math.round(ratio * (filtered.length - 1));
    setHoverIndex(Math.max(0, Math.min(filtered.length - 1, index)));
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="font-mono text-2xl font-bold text-zinc-100">
            ${display.toFixed(2)}
          </span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                positive ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
              }`}
            >
              {positive ? "+" : ""}
              {change.toFixed(2)}% · {range}
            </span>
            {totalInvested > 0 && (
              <span className={`text-xs ${vsInvested >= 0 ? "text-emerald-500/80" : "text-rose-500/80"}`}>
                {vsInvested >= 0 ? "+" : ""}
                {vsInvested.toFixed(2)}% vs invested
              </span>
            )}
          </div>
        </div>

        <div className="flex rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
          {(["1W", "1M", "3M", "ALL"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => {
                setRange(r);
                setHoverIndex(null);
              }}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                range === r ? "bg-white/[0.08] text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {hoverIndex != null && (
        <p className="mb-2 text-[11px] text-zinc-500">{formatDate(active.timestamp)}</p>
      )}

      <div className="rounded-xl bg-white/[0.02] p-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-48 w-full cursor-crosshair touch-none"
          preserveAspectRatio="none"
          onMouseMove={(e) => handlePointer(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => setHoverIndex(null)}
          onTouchMove={(e) => {
            const touch = e.touches[0];
            if (touch) handlePointer(touch.clientX, e.currentTarget.getBoundingClientRect());
          }}
          onTouchEnd={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          {totalInvested > 0 && (
            <line
              x1={pad}
              y1={yAt(totalInvested)}
              x2={width - pad}
              y2={yAt(totalInvested)}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
              strokeDasharray="6 4"
            />
          )}
          <polygon
            fill={`url(#${gradId})`}
            points={`${pad},${height - pad} ${points} ${width - pad},${height - pad}`}
          />
          <polyline
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            points={points}
          />
          {hoverIndex != null && (
            <>
              <line
                x1={xAt(activeIndex)}
                y1={pad}
                x2={xAt(activeIndex)}
                y2={height - pad}
                stroke="rgba(255,255,255,0.15)"
                strokeDasharray="4 4"
              />
              <circle
                cx={xAt(activeIndex)}
                cy={yAt(active.value)}
                r="4"
                fill={strokeColor}
                stroke="#050508"
                strokeWidth="2"
              />
            </>
          )}
        </svg>
      </div>

      <div className="mt-2 flex justify-between font-mono text-[11px] text-zinc-600">
        <span>{formatDate(filtered[0].timestamp)}</span>
        <span>
          {totalInvested > 0 ? `Invested $${totalInvested.toFixed(2)} · ` : ""}
          High ${max.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
