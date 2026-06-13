import { syncPricesToContract } from "@/lib/oracle";
import { getOraclePrivateKey, getStockVaultAddress } from "@/lib/config";
import { hydrateSnapshotStore } from "@/lib/snapshot-store";

const DEFAULT_INTERVAL_MS = 60_000;
const STARTUP_DELAY_MS = 8_000;

export type OracleSyncStatus = {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastSyncAt: number | null;
  lastTickerCount: number;
  lastTxHash: string | null;
  lastError: string | null;
};

const state: OracleSyncStatus = {
  enabled: false,
  running: false,
  intervalMs: DEFAULT_INTERVAL_MS,
  lastSyncAt: null,
  lastTickerCount: 0,
  lastTxHash: null,
  lastError: null,
};

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

export function getOracleSyncStatus(): OracleSyncStatus {
  return { ...state };
}

async function runSync() {
  if (state.running) return;
  if (!getStockVaultAddress() || !getOraclePrivateKey()) {
    state.enabled = false;
    state.lastError = "Vault or oracle key not configured";
    return;
  }

  state.enabled = true;
  state.running = true;
  state.lastError = null;

  try {
    hydrateSnapshotStore();
    const result = await syncPricesToContract();
    state.lastSyncAt = Date.now();
    state.lastTickerCount = result.tickers.length;
    state.lastTxHash = result.txHash ?? null;
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : "Oracle sync failed";
  } finally {
    state.running = false;
  }
}

/** Keep vault oracle prices in sync with market data for live trading. */
export function startOracleSyncer() {
  if (started) return;
  started = true;

  if (!getStockVaultAddress() || !getOraclePrivateKey()) {
    state.enabled = false;
    state.lastError = "Set STOCK_VAULT_ADDRESS and PRIVATE_KEY to enable auto price sync";
    return;
  }

  const intervalMs = Number(process.env.ORACLE_SYNC_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
  state.intervalMs = intervalMs;
  state.enabled = true;

  setTimeout(() => void runSync(), STARTUP_DELAY_MS);
  timer = setInterval(() => void runSync(), intervalMs);
}

export function stopOracleSyncer() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

export function recordManualOracleSync(result: { tickers: string[]; txHash?: string }) {
  state.lastSyncAt = Date.now();
  state.lastTickerCount = result.tickers.length;
  state.lastTxHash = result.txHash ?? null;
  state.lastError = null;
}
