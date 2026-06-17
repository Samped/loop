import "server-only";
import {
  aggregateBars,
  getStoredBarsForChart,
  type StoredMarkBar,
} from "@/lib/perp-mark-history-store";
import {
  buildCandles,
  getBucketMs,
  isStoredRange,
  type ChartRange,
  type MarkCandle,
  type MarkTick,
} from "@/lib/perp-mark-candles";

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
  const stored = getStoredBarsForChart(ticker, range);
  const bucketMs = getBucketMs(range);
  const fromStored = aggregateBars(stored, bucketMs);
  const tickCandles = buildCandles(liveTicks, range);

  if (isStoredRange(range)) {
    return fromStored;
  }

  // Serverless: persisted 5m bars are the reliable base. Overlay live ticks when dense.
  if (tickCandles.length >= 6) {
    return mergeCandleSeries(fromStored, tickCandles);
  }
  if (fromStored.length > 0) return fromStored;
  return tickCandles;
}

export function barsAsTickSeries(bars: StoredMarkBar[]): MarkTick[] {
  return bars.map((b) => ({ t: b.t, p: b.c }));
}

/** Flat bar so the chart renders before the engine has tick density. */
export function synthesizeMarkCandle(price: number, at = Date.now()): MarkCandle {
  const bucketMs = 15_000;
  const t = Math.floor(at / bucketMs) * bucketMs;
  return { t, open: price, high: price, low: price, close: price, ticks: 1 };
}

/** Placeholder series when no history exists yet (serverless cold start). */
export function synthesizeMarkCandlesFromPrice(
  price: number,
  range: ChartRange,
  at = Date.now(),
): MarkCandle[] {
  const bucketMs = getBucketMs(range);
  const barCount =
    range === "5M" ? 6 : range === "15M" ? 8 : range === "1H" ? 12 : range === "4H" ? 16 : 4;
  const candles: MarkCandle[] = [];
  for (let i = barCount - 1; i >= 0; i--) {
    const t = Math.floor((at - i * bucketMs) / bucketMs) * bucketMs;
    candles.push({ t, open: price, high: price, low: price, close: price, ticks: 1 });
  }
  return candles;
}
