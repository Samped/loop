import { syncPerpMarkPricesAndLiquidate } from "@/lib/perp-oracle";

const DEFAULT_INTERVAL_MS = 5_000;
const LIQUIDATOR_INTERVAL_MS = 3_000;
const STARTUP_DELAY_MS = 2_000;

type PerpSyncStatus = {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastSyncAt: number | null;
  lastTickerCount: number;
  lastLiquidationAt: number | null;
  lastLiquidatedCount: number;
  lastError: string | null;
};

const state: PerpSyncStatus = {
  enabled: false,
  running: false,
  intervalMs: DEFAULT_INTERVAL_MS,
  lastSyncAt: null,
  lastTickerCount: 0,
  lastLiquidationAt: null,
  lastLiquidatedCount: 0,
  lastError: null,
};

let started = false;
let syncChain: Promise<void> = Promise.resolve();

function isConfigured() {
  return Boolean(
    process.env.PERP_ENGINE_ADDRESS || process.env.NEXT_PUBLIC_PERP_ENGINE_ADDRESS,
  );
}

export function getPerpSyncStatus(): PerpSyncStatus {
  return { ...state };
}

async function executeSync(tickers?: string[]) {
  if (!isConfigured()) return;

  state.running = true;
  state.lastError = null;

  try {
    const result = await syncPerpMarkPricesAndLiquidate(tickers);
    state.lastSyncAt = Date.now();
    state.lastTickerCount = result.synced;
    if (result.error && result.synced === 0) state.lastError = result.error;
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : "Perp oracle sync failed";
  } finally {
    state.running = false;
  }
}

async function executeLiquidation(tickers?: string[]) {
  if (!isConfigured()) return;

  try {
    const { liquidateUnderwaterPositions } = await import("@/lib/perp-liquidator");
    const result = await liquidateUnderwaterPositions(tickers);
    state.lastLiquidationAt = Date.now();
    state.lastLiquidatedCount = result.liquidated;
    if (result.error) state.lastError = result.error;
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : "Liquidation scan failed";
  }
}

function queueSync(tickers?: string[]) {
  syncChain = syncChain.then(() => executeSync(tickers)).catch(() => {});
  return syncChain;
}

async function runSync() {
  if (state.running) return;
  await queueSync();
}

export function startPerpOracleSyncer() {
  if (started) return;
  started = true;

  if (!isConfigured()) {
    state.enabled = false;
    state.lastError = "Set PERP_ENGINE_ADDRESS to enable perp oracle sync";
    return;
  }

  state.enabled = true;
  state.intervalMs = Number(process.env.PERP_ORACLE_SYNC_INTERVAL_MS) || DEFAULT_INTERVAL_MS;

  setTimeout(() => {
    void runSync();
    void executeLiquidation();
  }, STARTUP_DELAY_MS);

  setInterval(() => void runSync(), state.intervalMs);
  setInterval(() => void executeLiquidation(), LIQUIDATOR_INTERVAL_MS);
}

export async function syncPerpPricesNow(tickers?: string[]) {
  startPerpOracleSyncer();
  await queueSync(tickers);
  await executeLiquidation(tickers);
  return getPerpSyncStatus();
}

export function nudgePerpLiquidation(tickers?: string[]) {
  startPerpOracleSyncer();
  void queueSync(tickers);
  void executeLiquidation(tickers);
}
