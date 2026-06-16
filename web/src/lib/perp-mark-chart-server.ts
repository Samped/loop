import "server-only";
import {
  aggregateBars,
  getStoredMarkBars,
  type StoredMarkBar,
} from "@/lib/perp-mark-history-store";
import {
  buildCandles,
  isStoredRange,
  type ChartRange,
  type MarkCandle,
  type MarkTick,
} from "@/lib/perp-mark-candles";

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

function mergeCandleSeries(base: MarkCandle[], overlay: MarkCandle[]): MarkCandle[] {
  const map = new Map<number, MarkCandle>();
  for (const c of base) map.set(c.t, c);
  for (const c of overlay) {
    const existing = map.get(c.t);
    if (!existing) {
      map.set(c.t, c);
      continue;
    }
    existing.high = Math.max(existing.high, c.high);
    existing.low = Math.min(existing.low, c.low);
    existing.close = c.close;
    existing.ticks += c.ticks;
  }
  return [...map.values()].sort((a, b) => a.t - b.t);
}

/** Build chart candles from persisted 5m bars (+ optional live ticks for the open bar). */
export function buildCandlesFromStored(
  ticker: string,
  range: ChartRange,
  liveTicks: MarkTick[] = [],
): MarkCandle[] {
  const windowMs = RANGE_MS[range] ?? 90 * 24 * 60 * 60_000;
  const since = Date.now() - windowMs;
  const stored = getStoredMarkBars(ticker, since);

  if (stored.length === 0 && liveTicks.length === 0) return [];

  const bucketMs = BUCKET_MS[range];

  if (isStoredRange(range)) {
    return aggregateBars(stored, bucketMs);
  }

  if (range === "4H") {
    const tickCandles = buildCandles(liveTicks, range);
    if (tickCandles.length >= 8) return tickCandles;
    const fromStored = aggregateBars(stored, bucketMs);
    if (fromStored.length === 0) return tickCandles;
    return mergeCandleSeries(fromStored, tickCandles);
  }

  return buildCandles(liveTicks, range);
}

export function barsAsTickSeries(bars: StoredMarkBar[]): MarkTick[] {
  return bars.map((b) => ({ t: b.t, p: b.c }));
}
