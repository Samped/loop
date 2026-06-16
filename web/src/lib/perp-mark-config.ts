/** Shared mark-engine config (no imports from engine/runner — avoids circular deps). */

export function getPerpMarkEngineMode(): "live" | "gbm" {
  return process.env.PERP_MARK_MODE === "gbm" ? "gbm" : "live";
}

export function getPerpMarkTickMs(): number {
  return getPerpMarkEngineMode() === "live"
    ? Number(process.env.PERP_INDEX_POLL_MS) || 2_500
    : Number(process.env.PERP_MARK_TICK_MS) || 1_000;
}

export function getPerpIndexTwapTicks(): number {
  const n = Number(process.env.PERP_INDEX_TWAP_TICKS);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 8;
}

/** Annual vol of mark oscillation around the stock index (live mode). */
export function getPerpBasisVol(): number {
  const n = Number(process.env.PERP_BASIS_VOL);
  return Number.isFinite(n) && n > 0 ? n : 0.95;
}

/** Max |mark − index| / index in live mode (e.g. 0.035 = 3.5%). */
export function getPerpMaxBasisFraction(): number {
  const n = Number(process.env.PERP_MAX_BASIS);
  return Number.isFinite(n) && n > 0 ? n : 0.035;
}

/** Per-tick probability of a basis jump (live mode). */
export function getPerpBasisJumpProb(): number {
  const n = Number(process.env.PERP_BASIS_JUMP_PROB);
  return Number.isFinite(n) && n >= 0 ? n : 0.01;
}
