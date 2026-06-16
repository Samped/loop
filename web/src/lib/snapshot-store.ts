import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { setCached } from "@/lib/market-cache";
import type { CryptoStock, Kline, MarketSnapshot, Sector } from "@/lib/sosovalue";

const STORE_PATH = join(process.cwd(), "data", "market.json");
const BUNDLE_PATH = join(process.cwd(), "public", "market-cache.json");
const LEGACY_PATH = join(process.cwd(), "data", "snapshots.json");
const SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1000;
const KLINES_MAX_AGE_MS = 15 * 60 * 1000;
const STOCKS_TTL_MS = 15 * 60 * 1000;
const SECTORS_TTL_MS = 15 * 60 * 1000;
const DEFAULT_KLINE_LIMIT = 90;

type MarketFile = {
  updatedAt: number;
  stocks?: CryptoStock[];
  sectors?: Sector[];
  snapshots: Record<string, MarketSnapshot>;
  klines?: Record<string, Kline[]>;
  klinesUpdatedAt?: Record<string, number>;
};

let hydrated = false;
let snapshots: Record<string, MarketSnapshot> = {};
let klines: Record<string, Kline[]> = {};
let klinesUpdatedAt: Record<string, number> = {};
let stocks: CryptoStock[] | null = null;
let sectors: Sector[] | null = null;
let updatedAt = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function loadMarketFile(path: string): MarketFile | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as MarketFile;
  } catch {
    return null;
  }
}

function applyMarketFile(raw: MarketFile) {
  snapshots = raw.snapshots ?? {};
  klines = raw.klines ?? {};
  klinesUpdatedAt = raw.klinesUpdatedAt ?? {};
  stocks = raw.stocks ?? null;
  sectors = raw.sectors ?? null;
  updatedAt = raw.updatedAt ?? 0;

  if (stocks) setCached("crypto-stocks", stocks, STOCKS_TTL_MS);
  if (sectors) setCached("crypto-sectors", sectors, SECTORS_TTL_MS);
  for (const [ticker, snapshot] of Object.entries(snapshots)) {
    setCachedSnapshot(ticker, snapshot);
  }
  for (const [ticker, data] of Object.entries(klines)) {
    setCachedKlines(ticker, data);
  }
}

function ensureHydrated() {
  if (hydrated) return;
  hydrated = true;

  const candidates = [STORE_PATH, BUNDLE_PATH, LEGACY_PATH].filter((p) => existsSync(p));
  let best: MarketFile | null = null;

  for (const path of candidates) {
    const raw = loadMarketFile(path);
    if (!raw) continue;
    if (!best || (raw.updatedAt ?? 0) >= (best.updatedAt ?? 0)) {
      best = raw;
    }
  }

  if (best) applyMarketFile(best);
}

function setCachedSnapshot(ticker: string, snapshot: MarketSnapshot) {
  setCached(`snapshot:${ticker.toUpperCase()}`, snapshot, SNAPSHOT_MAX_AGE_MS);
}

function setCachedKlines(ticker: string, data: Kline[]) {
  setCached(`klines:${ticker.toUpperCase()}:${DEFAULT_KLINE_LIMIT}`, data, KLINES_MAX_AGE_MS);
}

function schedulePersist() {
  if (process.env.VERCEL) return;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistMarketStore();
  }, 2000);
}

export function hydrateSnapshotStore() {
  ensureHydrated();
}

export function getMarketCacheAgeMs(): number {
  ensureHydrated();
  return updatedAt > 0 ? Date.now() - updatedAt : Number.POSITIVE_INFINITY;
}

export function hasBundledMarketCatalog(): boolean {
  ensureHydrated();
  return (stocks?.length ?? 0) > 20;
}

export function getStoredStocks(): CryptoStock[] | null {
  ensureHydrated();
  return stocks;
}

export function getStoredSectors(): Sector[] | null {
  ensureHydrated();
  return sectors;
}

export function setStoredStocks(next: CryptoStock[]) {
  ensureHydrated();
  stocks = next;
  setCached("crypto-stocks", next, STOCKS_TTL_MS);
  updatedAt = Date.now();
  schedulePersist();
}

export function setStoredSectors(next: Sector[]) {
  ensureHydrated();
  sectors = next;
  setCached("crypto-sectors", next, SECTORS_TTL_MS);
  updatedAt = Date.now();
  schedulePersist();
}

export function getStoredSnapshots(): Record<string, MarketSnapshot> {
  ensureHydrated();
  return { ...snapshots };
}

export function getStoredSnapshot(ticker: string): MarketSnapshot | null {
  ensureHydrated();
  return snapshots[ticker.toUpperCase()] ?? null;
}

export function getStoredKlines(ticker: string): Kline[] | null {
  ensureHydrated();
  const data = klines[ticker.toUpperCase()];
  return data?.length ? data : null;
}

export function isSnapshotStale(ticker: string): boolean {
  ensureHydrated();
  const snap = snapshots[ticker.toUpperCase()];
  if (!snap) return true;
  return Date.now() - snap.timestamp > SNAPSHOT_MAX_AGE_MS;
}

export function isKlinesStale(ticker: string): boolean {
  ensureHydrated();
  const upper = ticker.toUpperCase();
  if (!klines[upper]?.length) return true;
  const ts = klinesUpdatedAt[upper] ?? 0;
  return Date.now() - ts > KLINES_MAX_AGE_MS;
}

export function isTickerStale(ticker: string): boolean {
  return isSnapshotStale(ticker) || isKlinesStale(ticker);
}

export function setStoredSnapshot(ticker: string, snapshot: MarketSnapshot) {
  ensureHydrated();
  const upper = ticker.toUpperCase();
  snapshots[upper] = snapshot;
  updatedAt = Date.now();
  setCachedSnapshot(upper, snapshot);
  schedulePersist();
}

export function setStoredKlines(ticker: string, data: Kline[]) {
  ensureHydrated();
  const upper = ticker.toUpperCase();
  klines[upper] = data;
  klinesUpdatedAt[upper] = Date.now();
  setCachedKlines(upper, data);
  updatedAt = Date.now();
  schedulePersist();
}

export function bulkSetStoredSnapshots(next: Record<string, MarketSnapshot>) {
  ensureHydrated();
  for (const [ticker, snapshot] of Object.entries(next)) {
    snapshots[ticker.toUpperCase()] = snapshot;
    setCachedSnapshot(ticker, snapshot);
  }
  updatedAt = Date.now();
  schedulePersist();
}

export function persistMarketStore() {
  if (process.env.VERCEL) return;
  ensureHydrated();
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const payload: MarketFile = {
    updatedAt,
    stocks: stocks ?? undefined,
    sectors: sectors ?? undefined,
    snapshots,
    klines,
    klinesUpdatedAt,
  };
  writeFileSync(STORE_PATH, JSON.stringify(payload));
}

/** @deprecated use persistMarketStore */
export const persistSnapshotStore = persistMarketStore;
