"use client";

import { useMemo, useState } from "react";
import type { Kline } from "@/lib/sosovalue";

type Range = "1W" | "1M" | "3M" | "ALL";

const RANGE_DAYS: Record<Range, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
  ALL: Infinity,
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function toNum(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toMs(ts: unknown): number {
  const n = toNum(ts);
  if (n <= 0) return Date.now();
  // Some feeds send seconds while others send milliseconds (or stringified ms).
  return n < 10_000_000_000 ? n * 1000 : n;
}

function normalizeKline(k: Kline): Kline {
  return {
    timestamp: toMs(k.timestamp),
    open: toNum(k.open),
    high: toNum(k.high),
    low: toNum(k.low),
    close: toNum(k.close),
    volume: toNum(k.volume),
  };
}

function formatVolume(value: number) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString();
}

export function PriceChart({
  klines,
  ticker,
  latestPrice,
  latestTimestamp,
}: {
  klines: Kline[];
  ticker: string;
  latestPrice?: number;
  latestTimestamp?: number;
}) {
  const [range, setRange] = useState<Range>("3M");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const normalized = useMemo(() => {
    const sorted = [...klines].map(normalizeKline).sort((a, b) => a.timestamp - b.timestamp);
    const deduped: Kline[] = [];
    for (const k of sorted) {
      const prev = deduped[deduped.length - 1];
      if (prev && prev.timestamp === k.timestamp) {
        // Merge duplicate timestamps from mixed feed updates.
        prev.high = Math.max(prev.high, k.high);
        prev.low = Math.min(prev.low, k.low);
        prev.close = k.close;
        prev.volume += k.volume;
      } else {
        deduped.push({ ...k });
      }
    }

    if (!latestPrice || latestPrice <= 0) return deduped;
    const last = deduped[deduped.length - 1];
    const snapTs = toNum(latestTimestamp);
    const ts = snapTs > 0 ? toMs(snapTs) : (last?.timestamp ?? 0);
    if (!last) {
      return [
        {
          timestamp: ts,
          open: latestPrice,
          high: latestPrice,
          low: latestPrice,
          close: latestPrice,
          volume: 0,
        },
      ];
    }

    // Always align the latest candle close with live snapshot for a single displayed price.
    const aligned = [...deduped];
    const tail = aligned[aligned.length - 1]!;
    tail.close = latestPrice;
    tail.high = Math.max(tail.high, latestPrice);
    tail.low = Math.min(tail.low, latestPrice);
    if (ts > tail.timestamp) {
      aligned.push({
        timestamp: ts,
        open: tail.close,
        high: Math.max(tail.close, latestPrice),
        low: Math.min(tail.close, latestPrice),
        close: latestPrice,
        volume: 0,
      });
    }
    return aligned;
  }, [klines, latestPrice, latestTimestamp]);

  const filtered = useMemo(() => {
    const days = RANGE_DAYS[range];
    if (days === Infinity) return normalized;
    return normalized.slice(-days);
  }, [normalized, range]);

  if (filtered.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl bg-white/[0.02] text-sm text-zinc-600">
        No chart data
      </div>
    );
  }

  const activeIndex = hoverIndex ?? filtered.length - 1;
  const active = filtered[activeIndex];
  const closes = filtered.map((k) => k.close);
  const highs = filtered.map((k) => k.high);
  const lows = filtered.map((k) => k.low);
  const volumes = filtered.map((k) => k.volume);

  const priceMin = Math.min(...lows);
  const priceMax = Math.max(...highs);
  const priceRange = priceMax - priceMin || 1;
  const volMax = Math.max(...volumes) || 1;

  const width = 600;
  const height = 260;
  const padX = 12;
  const padTop = 12;
  const volHeight = 40;
  const priceHeight = height - volHeight - padTop - 8;

  const xAt = (i: number) =>
    padX + (i / Math.max(filtered.length - 1, 1)) * (width - padX * 2);

  const yPrice = (price: number) =>
    padTop + (1 - (price - priceMin) / priceRange) * priceHeight;

  const yVol = (vol: number) => padTop + priceHeight + 8 + (1 - vol / volMax) * (volHeight - 8);

  const linePoints = closes.map((close, i) => `${xAt(i)},${yPrice(close)}`).join(" ");

  const first = filtered[0].close;
  const displayClose = hoverIndex == null && latestPrice && latestPrice > 0 ? latestPrice : active.close;
  const change = ((displayClose - first) / first) * 100;
  const dayChange =
    activeIndex > 0
      ? ((displayClose - filtered[activeIndex - 1].close) / filtered[activeIndex - 1].close) * 100
      : 0;
  const positive = change >= 0;
  const strokeColor = positive ? "#34d399" : "#fb7185";
  const gradId = `chartGrad-${ticker}`;

  const handlePointer = (clientX: number, rect: DOMRect) => {
    const x = clientX - rect.left;
    const ratio = (x - padX * (rect.width / width)) / (rect.width - (padX * 2 * rect.width) / width);
    const index = Math.round(ratio * (filtered.length - 1));
    setHoverIndex(Math.max(0, Math.min(filtered.length - 1, index)));
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="font-mono text-3xl font-bold tracking-tight text-zinc-100">
            ${displayClose.toFixed(2)}
          </span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold ${
                positive ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
              }`}
            >
              {positive ? "+" : ""}
              {change.toFixed(2)}%
              <span className="font-normal text-zinc-600">· {range}</span>
            </span>
            {hoverIndex != null && (
              <span
                className={`text-xs font-medium ${
                  dayChange >= 0 ? "text-emerald-500/80" : "text-rose-500/80"
                }`}
              >
                {dayChange >= 0 ? "+" : ""}
                {dayChange.toFixed(2)}% vs prior day
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
                range === r
                  ? "bg-white/[0.08] text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="relative rounded-xl bg-white/[0.02] p-2">
        {hoverIndex != null && (
          <div className="pointer-events-none absolute left-2 right-2 top-2 z-10 rounded-lg border border-white/[0.08] bg-[#0a0a0f]/95 px-3 py-2 backdrop-blur-sm">
            <p className="text-[11px] font-medium text-zinc-500">{formatDate(active.timestamp)}</p>
            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-xs sm:grid-cols-5">
              <span className="text-zinc-400">
                O <span className="text-zinc-200">${active.open.toFixed(2)}</span>
              </span>
              <span className="text-zinc-400">
                H <span className="text-emerald-400">${active.high.toFixed(2)}</span>
              </span>
              <span className="text-zinc-400">
                L <span className="text-rose-400">${active.low.toFixed(2)}</span>
              </span>
              <span className="text-zinc-400">
                C <span className="text-zinc-200">${active.close.toFixed(2)}</span>
              </span>
              <span className="text-zinc-400">
                Vol <span className="text-zinc-200">{formatVolume(active.volume)}</span>
              </span>
            </div>
          </div>
        )}

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-64 w-full cursor-crosshair touch-none"
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

          {/* Volume bars */}
          {filtered.map((k, i) => {
            const barW = Math.max((width - padX * 2) / filtered.length - 1, 1);
            const x = xAt(i) - barW / 2;
            const y = yVol(k.volume);
            const h = padTop + priceHeight + 8 + volHeight - 8 - y;
            const activeBar = i === activeIndex;
            return (
              <rect
                key={`vol-${k.timestamp}-${i}`}
                x={x}
                y={y}
                width={barW}
                height={h}
                fill={activeBar ? strokeColor : "rgba(255,255,255,0.06)"}
                opacity={activeBar ? 0.5 : 1}
              />
            );
          })}

          <polygon
            fill={`url(#${gradId})`}
            points={`${padX},${padTop + priceHeight} ${linePoints} ${width - padX},${padTop + priceHeight}`}
          />
          <polyline
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={linePoints}
          />

          {/* Crosshair */}
          {hoverIndex != null && (
            <>
              <line
                x1={xAt(activeIndex)}
                y1={padTop}
                x2={xAt(activeIndex)}
                y2={padTop + priceHeight + volHeight}
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <circle
                cx={xAt(activeIndex)}
                cy={yPrice(active.close)}
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
        <span>
          {formatDate(filtered[0].timestamp)} · Low ${priceMin.toFixed(2)}
        </span>
        <span>High ${priceMax.toFixed(2)}</span>
      </div>
    </div>
  );
}
