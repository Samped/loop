export type MarkTick = { t: number; p: number };

export type MarkCandle = {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  ticks: number;
};

export type ChartRange = "5M" | "15M" | "1H" | "4H" | "1D" | "1W" | "1M" | "3M";

const RANGE_MS: Record<ChartRange, number | null> = {
  "5M": 5 * 60_000,
  "15M": 15 * 60_000,
  "1H": 60 * 60_000,
  "4H": 4 * 60 * 60_000,
  "1D": 24 * 60 * 60_000,
  "1W": 7 * 24 * 60 * 60_000,
  "1M": 30 * 24 * 60 * 60_000,
  "3M": 90 * 24 * 60 * 60_000,
};

const BUCKET_MS: Record<ChartRange, number> = {
  "5M": 5_000,
  "15M": 15_000,
  "1H": 60_000,
  "4H": 5 * 60_000,
  "1D": 15 * 60_000,
  "1W": 60 * 60_000,
  "1M": 4 * 60 * 60_000,
  "3M": 24 * 60 * 60_000,
};

export function getRangeWindowMs(range: ChartRange): number | null {
  return RANGE_MS[range];
}

export function getBucketMs(range: ChartRange): number {
  return BUCKET_MS[range];
}

export function isStoredRange(range: ChartRange): boolean {
  return range === "1D" || range === "1W" || range === "1M" || range === "3M";
}

export function filterTicksByRange(ticks: MarkTick[], range: ChartRange): MarkTick[] {
  if (!ticks.length) return [];
  const windowMs = RANGE_MS[range];
  if (windowMs == null) return ticks;
  const cutoff = ticks[ticks.length - 1].t - windowMs;
  return ticks.filter((pt) => pt.t >= cutoff);
}

export function ticksToCandles(ticks: MarkTick[], bucketMs: number): MarkCandle[] {
  if (!ticks.length) return [];
  const ms = Math.max(1_000, bucketMs);
  const buckets = new Map<number, MarkCandle>();

  for (const tick of ticks) {
    const key = Math.floor(tick.t / ms) * ms;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        t: key,
        open: tick.p,
        high: tick.p,
        low: tick.p,
        close: tick.p,
        ticks: 1,
      });
      continue;
    }
    existing.high = Math.max(existing.high, tick.p);
    existing.low = Math.min(existing.low, tick.p);
    existing.close = tick.p;
    existing.ticks += 1;
  }

  return [...buckets.values()].sort((a, b) => a.t - b.t);
}

export function buildCandles(ticks: MarkTick[], range: ChartRange): MarkCandle[] {
  const filtered = filterTicksByRange(ticks, range);
  if (filtered.length < 2) {
    const p = filtered[0]?.p;
    if (p == null) return [];
    const t = filtered[0].t;
    return [{ t, open: p, high: p, low: p, close: p, ticks: 1 }];
  }
  return ticksToCandles(filtered, BUCKET_MS[range]);
}

export function formatChartTime(ts: number, range: ChartRange): string {
  const d = new Date(ts);
  if (range === "5M" || range === "15M") {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
  }
  if (range === "1H" || range === "4H" || range === "1D") {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (range === "1W") {
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatPrice(price: number): string {
  if (price >= 10_000) return price.toFixed(0);
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(3);
  return price.toFixed(4);
}

export function nicePriceStep(min: number, max: number, targetLines = 6): number {
  const span = max - min || min * 0.001 || 1;
  const rough = span / targetLines;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = norm <= 1 ? mag : norm <= 2 ? 2 * mag : norm <= 5 ? 5 * mag : 10 * mag;
  return step;
}

export function sessionStats(candles: MarkCandle[]) {
  if (!candles.length) return { high: 0, low: 0, open: 0, close: 0, changePct: 0 };
  const high = Math.max(...candles.map((c) => c.high));
  const low = Math.min(...candles.map((c) => c.low));
  const open = candles[0].open;
  const close = candles[candles.length - 1].close;
  const changePct = open > 0 ? ((close - open) / open) * 100 : 0;
  return { high, low, open, close, changePct };
}

/** TradingView-style palette */
export const CHART_COLORS = {
  bull: "#26a69a",
  bear: "#ef5350",
  grid: "rgba(255,255,255,0.045)",
  gridStrong: "rgba(255,255,255,0.08)",
  axis: "rgba(113,113,122,0.9)",
  crosshair: "rgba(161,161,170,0.35)",
  lastPrice: "rgba(161,161,170,0.55)",
  index: "rgba(251,191,36,0.65)",
  volume: "rgba(113,113,122,0.35)",
  volumeActive: "rgba(38,166,154,0.45)",
  chartBg: "#08080c",
  scaleBg: "rgba(6,6,10,0.85)",
} as const;

export const CHART_RANGE_STORAGE_KEY = "loop:perp-chart-range";

export function loadSavedChartRange(): ChartRange {
  if (typeof window === "undefined") return "15M";
  const saved = localStorage.getItem(CHART_RANGE_STORAGE_KEY);
  const valid: ChartRange[] = ["5M", "15M", "1H", "4H", "1D", "1W", "1M", "3M"];
  return valid.includes(saved as ChartRange) ? (saved as ChartRange) : "15M";
}

export function saveChartRange(range: ChartRange) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHART_RANGE_STORAGE_KEY, range);
}
