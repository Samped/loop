import { getPerpMarkTickMs } from "@/lib/perp-mark-config";

const STARTUP_DELAY_MS = 1_500;

let started = false;

type RunnerStatus = {
  enabled: boolean;
  tickMs: number;
  lastTickAt: number | null;
  lastTickerCount: number;
  lastError: string | null;
};

const state: RunnerStatus = {
  enabled: false,
  tickMs: getPerpMarkTickMs(),
  lastTickAt: null,
  lastTickerCount: 0,
  lastError: null,
};

async function tick() {
  try {
    const { advanceAllPerpMarks } = await import("@/lib/perp-mark-engine");
    state.lastTickerCount = await advanceAllPerpMarks();
    state.lastTickAt = Date.now();
    state.lastError = null;
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : "Mark engine tick failed";
  }
}

export function getPerpMarkEngineStatus(): RunnerStatus {
  return { ...state };
}

export function startPerpMarkEngine() {
  if (started) return;
  started = true;
  state.enabled = true;
  state.tickMs = getPerpMarkTickMs();

  setTimeout(() => void tick(), STARTUP_DELAY_MS);
  setInterval(() => void tick(), state.tickMs);
}
