import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { MarkCandle, MarkTick } from "@/lib/perp-mark-candles";
import { getNeonSql } from "@/lib/neon";
import { isNeonCircuitOpen, tripNeonCircuit, withNeonGuard } from "@/lib/neon-guard";
import { PERP_MARKET_TICKERS } from "@/lib/perp-markets";

/** 5-minute OHLC bars — compact enough for ~120 days per ticker on disk. */
export type StoredMarkBar = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  n: number;
};

type HistoryFile = {
  updatedAt: number;
  bars: Record<string, StoredMarkBar[]>;
};

const STORE_PATH = join(process.cwd(), "data", "perp-mark-history.json");
const BAR_MS = 5 * 60_000;
/** ~120 days of 5m bars per ticker on disk. */
const MAX_BARS = 120 * 24 * 12;
/** Max bars synced to Neon per persist (latest bar only). */
const NEON_SYNC_BARS = 1;
const PERSIST_DEBOUNCE_MS = 15_000;

let hydrated = false;
let barsByTicker: Record<string, StoredMarkBar[]> = {};
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let neonReady = false;
let neonSyncInFlight = false;

function ensureHydrated() {
  if (hydrated) return;
  hydrated = true;
  if (!existsSync(STORE_PATH)) return;
  try {
    const raw = JSON.parse(readFileSync(STORE_PATH, "utf8")) as HistoryFile;
    barsByTicker = raw.bars ?? {};
  } catch {
    barsByTicker = {};
  }
}

async function ensureNeonSchema() {
  if (neonReady || isNeonCircuitOpen()) return neonReady;
  const sql = getNeonSql();
  if (!sql) return false;
  const ok = await withNeonGuard(async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS perp_mark_history_5m (
        ticker TEXT NOT NULL,
        bucket_ts BIGINT NOT NULL,
        open DOUBLE PRECISION NOT NULL,
        high DOUBLE PRECISION NOT NULL,
        low DOUBLE PRECISION NOT NULL,
        close DOUBLE PRECISION NOT NULL,
        ticks INTEGER NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (ticker, bucket_ts)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_perp_mark_history_5m_ticker_ts ON perp_mark_history_5m (ticker, bucket_ts DESC)`;
    return true;
  }, 2_000);
  if (ok) neonReady = true;
  return neonReady;
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistPerpMarkHistory();
  }, PERSIST_DEBOUNCE_MS);
}

export function hydratePerpMarkHistoryStore() {
  ensureHydrated();
  seedEmptyHistoryStores();
  void hydratePerpMarkHistoryFromNeon();
}

async function hydratePerpMarkHistoryFromNeon() {
  const sql = getNeonSql();
  if (!sql) return;

  try {
    if (!(await ensureNeonSchema())) return;

    const rows = (await withNeonGuard(async () => sql`
      SELECT ticker, bucket_ts, open, high, low, close, ticks
      FROM perp_mark_history_5m
      WHERE ticker = ANY(${PERP_MARKET_TICKERS as unknown as string[]})
      ORDER BY ticker ASC, bucket_ts ASC
    `, 3_000)) as Array<{
      ticker: string;
      bucket_ts: string | number;
      open: string | number;
      high: string | number;
      low: string | number;
      close: string | number;
      ticks: string | number;
    }> | null;
    if (!rows) return;

    const next: Record<string, StoredMarkBar[]> = {};
    for (const ticker of PERP_MARKET_TICKERS) next[ticker] = [];
    for (const row of rows) {
      const upper = row.ticker.toUpperCase();
      if (!next[upper]) next[upper] = [];
      next[upper]!.push({
        t: Number(row.bucket_ts),
        o: Number(row.open),
        h: Number(row.high),
        l: Number(row.low),
        c: Number(row.close),
        n: Number(row.ticks),
      });
    }
    for (const ticker of Object.keys(next)) {
      next[ticker] = pruneBars(next[ticker]!);
    }
    if (Object.values(next).some((list) => list.length > 0)) {
      barsByTicker = next;
    }
  } catch {
    tripNeonCircuit();
  }
}

export async function persistPerpMarkHistory() {
  ensureHydrated();
  seedEmptyHistoryStores();
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify({ updatedAt: Date.now(), bars: barsByTicker }));

  queueNeonPersist();
}

function queueNeonPersist() {
  if (neonSyncInFlight || isNeonCircuitOpen()) return;
  const sql = getNeonSql();
  if (!sql) return;

  neonSyncInFlight = true;
  void pushRecentBarsToNeon(sql).finally(() => {
    neonSyncInFlight = false;
  });
}

async function pushRecentBarsToNeon(sql: NonNullable<ReturnType<typeof getNeonSql>>) {
  if (!(await ensureNeonSchema())) {
    tripNeonCircuit();
    return;
  }

  const now = Date.now();
  for (const [ticker, list] of Object.entries(barsByTicker)) {
    if (isNeonCircuitOpen()) return;
    const recent = list.slice(-NEON_SYNC_BARS);
    for (const bar of recent) {
      const ok = await withNeonGuard(
        () => sql`
          INSERT INTO perp_mark_history_5m
            (ticker, bucket_ts, open, high, low, close, ticks, updated_at)
          VALUES
            (${ticker}, ${bar.t}, ${bar.o}, ${bar.h}, ${bar.l}, ${bar.c}, ${bar.n}, ${now})
          ON CONFLICT (ticker, bucket_ts)
          DO UPDATE SET
            high = GREATEST(perp_mark_history_5m.high, EXCLUDED.high),
            low = LEAST(perp_mark_history_5m.low, EXCLUDED.low),
            close = EXCLUDED.close,
            ticks = EXCLUDED.ticks,
            updated_at = EXCLUDED.updated_at
        `,
        1_500,
      );
      if (ok === null) return;
    }
  }
}

function pruneBars(list: StoredMarkBar[]): StoredMarkBar[] {
  if (list.length <= MAX_BARS) return list;
  return list.slice(-MAX_BARS);
}

/** Merge a live tick into the 5m bar series for a ticker. */
export function recordMarkSample(ticker: string, price: number, at: number) {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(at)) return;
  ensureHydrated();
  const upper = ticker.toUpperCase();
  const key = Math.floor(at / BAR_MS) * BAR_MS;
  let list = barsByTicker[upper];
  if (!list) {
    list = [];
    barsByTicker[upper] = list;
  }

  const last = list[list.length - 1];
  if (last && last.t === key) {
    last.h = Math.max(last.h, price);
    last.l = Math.min(last.l, price);
    last.c = price;
    last.n += 1;
  } else if (!last || key > last.t) {
    list.push({ t: key, o: price, h: price, l: price, c: price, n: 1 });
    barsByTicker[upper] = pruneBars(list);
  } else {
    // out-of-order tick — update matching bucket if present
    const idx = list.findIndex((b) => b.t === key);
    if (idx >= 0) {
      const bar = list[idx]!;
      bar.h = Math.max(bar.h, price);
      bar.l = Math.min(bar.l, price);
      bar.c = price;
      bar.n += 1;
    }
  }

  schedulePersist();
}

export function getStoredMarkBars(ticker: string, sinceMs = 0): StoredMarkBar[] {
  ensureHydrated();
  const list = barsByTicker[ticker.toUpperCase()] ?? [];
  if (sinceMs <= 0) return [...list];
  return list.filter((b) => b.t >= sinceMs);
}

/** Restore recent chart context after server restart (minute-level from 5m closes). */
export function getRestoredMarkTicks(ticker: string, windowMs: number): MarkTick[] {
  const since = Date.now() - windowMs;
  return getStoredMarkBars(ticker, since).map((b) => ({ t: b.t + BAR_MS - 1, p: b.c }));
}

export function storedBarToCandle(bar: StoredMarkBar): MarkCandle {
  return {
    t: bar.t,
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    ticks: bar.n,
  };
}

export function aggregateBars(bars: StoredMarkBar[], bucketMs: number): MarkCandle[] {
  if (!bars.length) return [];
  const ms = Math.max(BAR_MS, bucketMs);
  const buckets = new Map<number, MarkCandle>();

  for (const bar of bars) {
    const key = Math.floor(bar.t / ms) * ms;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        t: key,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        ticks: bar.n,
      });
      continue;
    }
    existing.high = Math.max(existing.high, bar.h);
    existing.low = Math.min(existing.low, bar.l);
    existing.close = bar.c;
    existing.ticks += bar.n;
  }

  return [...buckets.values()].sort((a, b) => a.t - b.t);
}

export function seedEmptyHistoryStores(tickers: readonly string[] = PERP_MARKET_TICKERS) {
  ensureHydrated();
  for (const ticker of tickers) {
    const upper = ticker.toUpperCase();
    if (!barsByTicker[upper]) barsByTicker[upper] = [];
  }
}
