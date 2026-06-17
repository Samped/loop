import "server-only";
import {
  aggregateBars,
  getStoredMarkBars,
  type StoredMarkBar,
} from "@/lib/perp-mark-history-store";
import {
  buildCandles,
  getBucketMs,
  getRangeWindowMs,
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

/** Live intraday candles are 5s–5m buckets; persisted bars are always 5m+. */
function prependStoredContext(
  stored: MarkCandle[],
  live: MarkCandle[],
  range: ChartRange,
): MarkCandle[] {
  if (!stored.length || !live.length) return live.length ? live : stored;
  const windowMs = getRangeWindowMs(range);
  if (windowMs == null) return mergeCandleSeries(stored, live);

  const windowStart = live[0]!.t - windowMs;
  const bucketMs = getBucketMs(range);
  const context = stored.filter((bar) => bar.t < live[0]!.t && bar.t >= windowStart - bucketMs);
  if (!context.length) return live;
  return mergeCandleSeries(context, live);
}

/** Build chart candles from persisted 5m bars (+ optional live ticks for the open bar). */
export function buildCandlesFromStored(
  ticker: string,
  range: ChartRange,
  liveTicks: MarkTick[] = [],
): MarkCandle[] {
  const windowMs = getRangeWindowMs(range) ?? 90 * 24 * 60 * 60_000;
  const since = Date.now() - windowMs;
  const stored = getStoredMarkBars(ticker, since);

  const bucketMs = getBucketMs(range);
  const fromStored = aggregateBars(stored, bucketMs);
  const tickCandles = buildCandles(liveTicks, range);

  if (isStoredRange(range)) {
    return fromStored;
  }

  // Intraday: prefer high-frequency live ticks. Coarse 5m bars alone look like 1–2 giant candles.
  if (tickCandles.length >= 6) {
    return tickCandles;
  }
  if (tickCandles.length >= 2) {
    return prependStoredContext(fromStored, tickCandles, range);
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
