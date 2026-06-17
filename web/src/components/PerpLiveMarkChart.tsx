"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CHART_COLORS,
  formatChartTime,
  formatPrice,
  getBucketMs,
  getRangeWindowMs,
  loadSavedChartRange,
  nicePriceStep,
  saveChartRange,
  sessionStats,
  type ChartRange,
  type MarkCandle,
} from "@/lib/perp-mark-candles";

type MarkMeta = {
  anchorPrice: number | null;
  twapPrice: number | null;
  mode: string | null;
  marketOpen: boolean;
};

type ChartMode = "candles" | "line";

const RANGES: ChartRange[] = ["5M", "15M", "1H", "4H", "1D", "1W", "1M", "3M"];

const W = 720;
const H = 400;
const PAD = { top: 12, right: 62, bottom: 22, left: 8 };
const VOL_H = 52;
const PRICE_H = H - PAD.top - PAD.bottom - VOL_H - 6;
const CHART_W = W - PAD.left - PAD.right;

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | "neutral";
}) {
  const color =
    tone === "up" ? "text-emerald-400" : tone === "down" ? "text-rose-400" : "text-zinc-300";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">{label}</span>
      <span className={`font-mono text-xs font-semibold ${color}`}>{value}</span>
    </div>
  );
}

export function PerpLiveMarkChart({ ticker }: { ticker: string }) {
  const upper = ticker.toUpperCase();
  const mountedRef = useRef(false);
  const [candles, setCandles] = useState<MarkCandle[]>([]);
  const [meta, setMeta] = useState<MarkMeta>({
    anchorPrice: null,
    twapPrice: null,
    mode: null,
    marketOpen: true,
  });
  const [range, setRange] = useState<ChartRange>(() => loadSavedChartRange());
  const [chartMode, setChartMode] = useState<ChartMode>("candles");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [historyReady, setHistoryReady] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!upper) return;
    let cancelled = false;

    const applyPayload = (data: {
      price?: number;
      anchorPrice?: number;
      twapPrice?: number;
      updatedAt?: number;
      mode?: string;
      marketOpen?: boolean;
      candles?: MarkCandle[];
      snapshot?: {
        price?: number;
        anchorPrice?: number;
        twapPrice?: number;
        updatedAt?: number;
        mode?: string;
        marketOpen?: boolean;
      };
    }) => {
      if (cancelled || !mountedRef.current) return;
      const snap = data.snapshot ?? data;
      const price = snap.price;
      if (typeof price === "number" && price > 0) {
        setMeta({
          anchorPrice: typeof snap.anchorPrice === "number" ? snap.anchorPrice : null,
          twapPrice: typeof snap.twapPrice === "number" ? snap.twapPrice : null,
          mode: snap.mode ?? null,
          marketOpen: snap.marketOpen !== false,
        });
      }
      if (Array.isArray(data.candles)) {
        setCandles(data.candles);
        setHistoryReady(true);
      }
    };

    const fetchChart = async () => {
      try {
        const url = `/api/perp/mark/${upper}?range=${encodeURIComponent(range)}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok || cancelled || !mountedRef.current) return;
        applyPayload((await res.json()) as Parameters<typeof applyPayload>[0]);
      } catch {
        // keep last
      }
    };

    void fetchChart();
    const pollMs = range === "1M" || range === "3M" ? 5_000 : 400;
    const id = setInterval(() => void fetchChart(), pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [upper, range]);

  const selectRange = useCallback((next: ChartRange) => {
    setHoverIndex(null);
    setHistoryReady(false);
    setCandles([]);
    setRange(next);
    saveChartRange(next);
  }, []);

  const stats = useMemo(() => sessionStats(candles), [candles]);

  const chart = useMemo(() => {
    if (!candles.length) return null;

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    let priceMin = Math.min(...lows);
    let priceMax = Math.max(...highs);

    const anchor = meta.anchorPrice;
    if (anchor != null && anchor > 0) {
      priceMin = Math.min(priceMin, anchor);
      priceMax = Math.max(priceMax, anchor);
    }

    const pad = (priceMax - priceMin) * 0.05 || priceMin * 0.002;
    priceMin -= pad;
    priceMax += pad;
    const priceSpan = priceMax - priceMin || 1;

    const windowMs = getRangeWindowMs(range) ?? 15 * 60_000;
    const windowEnd = Math.max(Date.now(), candles[candles.length - 1]!.t + getBucketMs(range));
    const windowStart = windowEnd - windowMs;
    const timeSpan = Math.max(windowEnd - windowStart, 1);

    const xAt = (ts: number) => {
      const ratio = (ts - windowStart) / timeSpan;
      return PAD.left + Math.min(1, Math.max(0, ratio)) * CHART_W;
    };
    const yPrice = (price: number) => PAD.top + (1 - (price - priceMin) / priceSpan) * PRICE_H;
    const volTop = PAD.top + PRICE_H + 6;
    const volMax = Math.max(...candles.map((c) => c.ticks), 1);
    const yVol = (v: number) => volTop + VOL_H - (v / volMax) * (VOL_H - 4);

    const step = nicePriceStep(priceMin, priceMax);
    const gridPrices: number[] = [];
    for (let p = Math.ceil(priceMin / step) * step; p <= priceMax; p += step) {
      gridPrices.push(p);
    }

    const bucketMs = getBucketMs(range);
    const slotW = (bucketMs / timeSpan) * CHART_W * 0.82;
    const candleW = Math.min(Math.max(slotW, 2.5), 12);
    const linePoints = candles.map((c) => `${xAt(c.t)},${yPrice(c.close)}`).join(" ");

    const nearestIndex = (ts: number) => {
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < candles.length; i++) {
        const dist = Math.abs(candles[i]!.t - ts);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      return best;
    };

    return {
      candles,
      priceMin,
      priceMax,
      windowStart,
      windowEnd,
      xAt,
      nearestIndex,
      yPrice,
      yVol,
      volTop,
      volMax,
      gridPrices,
      linePoints,
      candleW,
      last: candles[candles.length - 1].close,
    };
  }, [candles, meta.anchorPrice, range]);

  const activeIndex = hoverIndex ?? (chart ? chart.candles.length - 1 : 0);
  const active: MarkCandle | null = chart ? chart.candles[activeIndex] ?? null : null;

  const handlePointer = useCallback(
    (clientX: number, rect: DOMRect) => {
      if (!chart || chart.candles.length === 0) return;
      const scale = rect.width / W;
      const x = (clientX - rect.left) / scale;
      const ratio = (x - PAD.left) / CHART_W;
      const targetT = chart.windowStart + ratio * (chart.windowEnd - chart.windowStart);
      setHoverIndex(chart.nearestIndex(targetT));
    },
    [chart],
  );

  if (!historyReady) {
    return (
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#08080c] px-6 py-20 text-center text-sm text-zinc-500">
        <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-emerald-500/20 border-t-emerald-400" />
        Loading {range} chart…
      </div>
    );
  }

  if (!chart || !active) {
    return (
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#08080c] px-6 py-16 text-center text-sm text-zinc-500">
        <p className="text-zinc-400">Building mark history for {range}…</p>
        <p className="mt-2 text-xs text-zinc-600">
          5-minute bars are saved to disk as the engine runs. Longer ranges fill in over hours and
          days.
        </p>
      </div>
    );
  }

  const displayPrice = active.close;
  const anchor = meta.anchorPrice;
  const basisPct = anchor && anchor > 0 ? ((displayPrice - anchor) / anchor) * 100 : null;
  const prior = activeIndex > 0 ? chart.candles[activeIndex - 1] : null;
  const barChange = prior ? ((active.close - prior.close) / prior.close) * 100 : 0;
  const up = stats.changePct >= 0;
  const trendColor = up ? CHART_COLORS.bull : CHART_COLORS.bear;
  const gradId = `perpGrad-${upper}`;
  const isLive = meta.marketOpen && meta.mode !== "closed";
  const crossPrice = hoverIndex != null ? active.close : chart.last;
  const crossY = chart.yPrice(crossPrice);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#08080c] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-sm font-bold tracking-tight text-zinc-100">
                {upper}
                <span className="ml-1.5 font-normal text-zinc-500">· PERP</span>
              </h2>
              {isLive ? (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  Live
                </span>
              ) : (
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-400">
                  After hours
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-2xl font-bold tabular-nums text-zinc-50 sm:text-3xl">
                ${displayPrice.toFixed(2)}
              </span>
              <span
                className={`font-mono text-sm font-semibold tabular-nums ${up ? "text-emerald-400" : "text-rose-400"}`}
              >
                {up ? "+" : ""}
                {stats.changePct.toFixed(2)}%
              </span>
              {anchor != null && anchor > 0 && basisPct != null ? (
                <span className="text-xs text-zinc-500">
                  Index ${anchor.toFixed(2)}
                  <span className={basisPct >= 0 ? " text-emerald-500/70" : " text-rose-500/70"}>
                    {" "}
                    ({basisPct >= 0 ? "+" : ""}
                    {basisPct.toFixed(2)}% basis)
                  </span>
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 sm:gap-4">
            <StatPill label="Open" value={`$${formatPrice(stats.open)}`} />
            <StatPill label="High" value={`$${formatPrice(stats.high)}`} tone="up" />
            <StatPill label="Low" value={`$${formatPrice(stats.low)}`} tone="down" />
            <StatPill
              label="TWAP"
              value={meta.twapPrice ? `$${formatPrice(meta.twapPrice)}` : "—"}
              tone="neutral"
            />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.05] px-4 py-2 sm:px-5">
        <div className="flex items-center gap-1">
          <div className="flex rounded-md border border-white/[0.07] bg-black/30 p-0.5">
            {(["candles", "line"] as ChartMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setChartMode(m)}
                className={`rounded px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                  chartMode === m
                    ? "bg-white/[0.1] text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <span className="hidden text-[10px] text-zinc-600 sm:inline">Settlement mark · USDC</span>
        </div>
        <div className="flex rounded-md border border-white/[0.07] bg-black/30 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => selectRange(r)}
              className={`min-w-[2.25rem] rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
                range === r ? "bg-white/[0.1] text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart canvas */}
      <div className="relative px-1 pb-1 pt-0">
        {/* OHLC legend overlay */}
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-white/[0.08] bg-black/75 px-2.5 py-1.5 backdrop-blur-sm">
          <p className="font-mono text-[10px] text-zinc-500">{formatChartTime(active.t, range)}</p>
          <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[11px]">
            <span className="text-zinc-500">
              O <span className="text-zinc-200">{formatPrice(active.open)}</span>
            </span>
            <span className="text-zinc-500">
              H <span className="text-emerald-400">{formatPrice(active.high)}</span>
            </span>
            <span className="text-zinc-500">
              L <span className="text-rose-400">{formatPrice(active.low)}</span>
            </span>
            <span className="text-zinc-500">
              C <span className="text-zinc-100">{formatPrice(active.close)}</span>
            </span>
            {prior ? (
              <span className={barChange >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {barChange >= 0 ? "+" : ""}
                {barChange.toFixed(3)}%
              </span>
            ) : null}
          </div>
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-[22rem] w-full cursor-crosshair touch-none sm:h-[26rem]"
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
              <stop offset="0%" stopColor={trendColor} stopOpacity="0.18" />
              <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
            </linearGradient>
            <clipPath id={`clip-${upper}`}>
              <rect x={PAD.left} y={PAD.top} width={CHART_W} height={PRICE_H + VOL_H + 6} />
            </clipPath>
          </defs>

          {/* Chart background */}
          <rect x={PAD.left} y={PAD.top} width={CHART_W} height={PRICE_H} fill={CHART_COLORS.chartBg} />
          <rect
            x={W - PAD.right}
            y={PAD.top}
            width={PAD.right}
            height={PRICE_H + VOL_H + 6}
            fill={CHART_COLORS.scaleBg}
          />

          {/* Horizontal grid */}
          {chart.gridPrices.map((price, i) => {
            const y = chart.yPrice(price);
            const strong = i === 0 || i === chart.gridPrices.length - 1;
            return (
              <g key={`g-${price}`}>
                <line
                  x1={PAD.left}
                  y1={y}
                  x2={W - PAD.right}
                  y2={y}
                  stroke={strong ? CHART_COLORS.gridStrong : CHART_COLORS.grid}
                  strokeWidth="1"
                />
                <text
                  x={W - PAD.right + 8}
                  y={y + 3.5}
                  fill={CHART_COLORS.axis}
                  fontSize="10"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {formatPrice(price)}
                </text>
              </g>
            );
          })}

          {/* Volume separator */}
          <line
            x1={PAD.left}
            y1={chart.volTop - 2}
            x2={W - PAD.right}
            y2={chart.volTop - 2}
            stroke={CHART_COLORS.gridStrong}
            strokeWidth="1"
          />

          <g clipPath={`url(#clip-${upper})`}>
            {/* Volume bars */}
            {chart.candles.map((c) => {
              const x = chart.xAt(c.t);
              const barW = Math.max(chart.candleW * 0.9, 2);
              const y = chart.yVol(c.ticks);
              const h = chart.volTop + VOL_H - 4 - y;
              const bullish = c.close >= c.open;
              const activeBar = c.t === active.t;
              return (
                <rect
                  key={`v-${c.t}`}
                  x={x - barW / 2}
                  y={y}
                  width={barW}
                  height={Math.max(h, 1)}
                  fill={activeBar ? CHART_COLORS.volumeActive : CHART_COLORS.volume}
                  opacity={bullish ? 0.85 : 0.65}
                />
              );
            })}

            {/* Index line */}
            {anchor != null && anchor > 0 && anchor >= chart.priceMin && anchor <= chart.priceMax ? (
              <line
                x1={PAD.left}
                y1={chart.yPrice(anchor)}
                x2={W - PAD.right}
                y2={chart.yPrice(anchor)}
                stroke={CHART_COLORS.index}
                strokeWidth="1"
                strokeDasharray="5 4"
              />
            ) : null}

            {/* TWAP line */}
            {meta.twapPrice != null &&
            meta.twapPrice > 0 &&
            meta.twapPrice >= chart.priceMin &&
            meta.twapPrice <= chart.priceMax ? (
              <line
                x1={PAD.left}
                y1={chart.yPrice(meta.twapPrice)}
                x2={W - PAD.right}
                y2={chart.yPrice(meta.twapPrice)}
                stroke="rgba(147,197,253,0.45)"
                strokeWidth="1"
                strokeDasharray="3 5"
              />
            ) : null}

            {/* Last price line */}
            <line
              x1={PAD.left}
              y1={chart.yPrice(chart.last)}
              x2={W - PAD.right}
              y2={chart.yPrice(chart.last)}
              stroke={CHART_COLORS.lastPrice}
              strokeWidth="1"
              strokeDasharray="2 3"
            />

            {/* Candles or line */}
            {chartMode === "candles"
              ? chart.candles.map((c) => {
                  const x = chart.xAt(c.t);
                  const bullish = c.close >= c.open;
                  const color = bullish ? CHART_COLORS.bull : CHART_COLORS.bear;
                  const bodyTop = chart.yPrice(Math.max(c.open, c.close));
                  const bodyBot = chart.yPrice(Math.min(c.open, c.close));
                  const bodyH = Math.max(bodyBot - bodyTop, 1);
                  const wickTop = chart.yPrice(c.high);
                  const wickBot = chart.yPrice(c.low);
                  const dimmed = hoverIndex != null && c.t !== active.t;
                  return (
                    <g key={`c-${c.t}`} opacity={dimmed ? 0.45 : 1}>
                      <line
                        x1={x}
                        y1={wickTop}
                        x2={x}
                        y2={wickBot}
                        stroke={color}
                        strokeWidth="1"
                      />
                      <rect
                        x={x - chart.candleW / 2}
                        y={bodyTop}
                        width={chart.candleW}
                        height={bodyH}
                        fill={bullish ? CHART_COLORS.chartBg : color}
                        stroke={color}
                        strokeWidth="1.2"
                      />
                    </g>
                  );
                })
              : (
                <>
                  <polygon
                    fill={`url(#${gradId})`}
                    points={`${PAD.left},${PAD.top + PRICE_H} ${chart.linePoints} ${W - PAD.right},${PAD.top + PRICE_H}`}
                  />
                  <polyline
                    fill="none"
                    stroke={trendColor}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={chart.linePoints}
                  />
                </>
              )}
          </g>

          {/* Crosshair */}
          {hoverIndex != null ? (
            <>
              <line
                x1={chart.xAt(active.t)}
                y1={PAD.top}
                x2={chart.xAt(active.t)}
                y2={chart.volTop + VOL_H}
                stroke={CHART_COLORS.crosshair}
                strokeWidth="1"
              />
              <line
                x1={PAD.left}
                y1={crossY}
                x2={W - PAD.right}
                y2={crossY}
                stroke={CHART_COLORS.crosshair}
                strokeWidth="1"
              />
              {/* Y-axis price tag */}
              <rect
                x={W - PAD.right + 2}
                y={crossY - 9}
                width={PAD.right - 4}
                height={18}
                rx="2"
                fill={trendColor}
              />
              <text
                x={W - PAD.right + PAD.right / 2 - 2}
                y={crossY + 4}
                fill="#050508"
                fontSize="10"
                fontWeight="600"
                fontFamily="ui-monospace, monospace"
                textAnchor="middle"
              >
                {formatPrice(crossPrice)}
              </text>
            </>
          ) : (
            <>
              <rect
                x={W - PAD.right + 2}
                y={chart.yPrice(chart.last) - 9}
                width={PAD.right - 4}
                height={18}
                rx="2"
                fill={trendColor}
              />
              <text
                x={W - PAD.right + PAD.right / 2 - 2}
                y={chart.yPrice(chart.last) + 4}
                fill="#050508"
                fontSize="10"
                fontWeight="600"
                fontFamily="ui-monospace, monospace"
                textAnchor="middle"
              >
                {formatPrice(chart.last)}
              </text>
              <circle
                cx={chart.xAt(chart.candles[chart.candles.length - 1]!.t)}
                cy={chart.yPrice(chart.last)}
                r="3.5"
                fill={trendColor}
                stroke="#050508"
                strokeWidth="1.5"
              />
            </>
          )}

          {/* X-axis */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const i = Math.round(frac * (chart.candles.length - 1));
            const c = chart.candles[i];
            if (!c) return null;
            return (
              <text
                key={`x-${frac}`}
                x={chart.xAt(c.t)}
                y={H - 5}
                fill={CHART_COLORS.axis}
                fontSize="9"
                fontFamily="ui-monospace, monospace"
                textAnchor="middle"
              >
                {formatChartTime(c.t, range)}
              </text>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-2 pt-1 text-[10px] text-zinc-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-px w-4 border-t border-dashed border-amber-400/70" />
            Index
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-px w-4 border-t border-dashed border-sky-400/50" />
            TWAP
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-px w-4 border-t border-dashed border-zinc-500" />
            Last
          </span>
          <span className="ml-auto font-mono text-zinc-700">
            {chart.candles.length} bars · persisted on server
          </span>
        </div>
      </div>
    </div>
  );
}
