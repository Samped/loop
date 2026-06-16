import "server-only";
import { randomBytes } from "crypto";
import { fetchStockIndexPrice } from "@/lib/perp-index";
import {
  getPerpMarkEngineMode,
  getPerpBasisVol,
  getPerpMaxBasisFraction,
  getPerpBasisJumpProb,
  getPerpIndexTwapTicks,
} from "@/lib/perp-mark-config";
import { PERP_MARKET_TICKERS } from "@/lib/perp-markets";
import { isUsRegularSessionOpen } from "@/lib/us-market-hours";
import { getFinnhubQuote } from "@/lib/finnhub";
import { getStoredSnapshot, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { getMarketSnapshot } from "@/lib/sosovalue";
import {
  getRestoredMarkTicks,
  recordMarkSample,
} from "@/lib/perp-mark-history-store";
import { buildCandlesFromStored } from "@/lib/perp-mark-chart-server";
import type { ChartRange, MarkCandle } from "@/lib/perp-mark-candles";

export type PerpMarkMode = "live" | "gbm" | "closed" | "frozen";

export type PerpMarkSnapshot = {
  ticker: string;
  price: number;
  twapPrice: number;
  anchorPrice: number;
  mode: PerpMarkMode;
  updatedAt: number;
  /** Legacy field — unused in live mode (kept for API compat). */
  annualVol: number;
  marketOpen: boolean;
  sourceCount: number;
};

type TickerState = {
  mark: number;
  anchor: number;
  mode: PerpMarkMode;
  lastAdvanceMs: number;
  lastAnchorRefreshMs: number;
  lastLiveCheckMs: number;
  baseVol: number;
  currentVol: number;
  momentum: number;
  momentumTicks: number;
  sourceCount: number;
  marketOpen: boolean;
  history: { price: number; at: number }[];
};

const ANCHOR_REFRESH_MS = 60_000;
const LIVE_CHECK_MS = 30_000;
const LIVE_QUOTE_MAX_AGE_MS = 120_000;
/** ~6h of ticks at 2.5s poll — enough for intraday perp chart. */
const HISTORY_MAX = 8_640;
const MIN_ADVANCE_GAP_MS = 250;

const states = new Map<string, TickerState>();

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function twapWindow(): number {
  return getPerpIndexTwapTicks();
}

function maxDeviationFraction(): number {
  return envNumber("PERP_MARK_MAX_DEVIATION", 0.2);
}

function volMultiplier(): number {
  return envNumber("PERP_MARK_VOL_MULTIPLIER", 8);
}

function meanReversionKappa(): number {
  return envNumber("PERP_MARK_MEAN_REVERSION", 2);
}

function jumpProbability(): number {
  return envNumber("PERP_MARK_JUMP_PROB", 0.004);
}

function uniform01(): number {
  return randomBytes(4).readUInt32BE(0) / 0xffffffff;
}

function gaussianSample(): number {
  const u1 = uniform01() || 1e-12;
  const u2 = uniform01();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function rollMomentum(state: TickerState) {
  if (state.momentumTicks > 0) {
    state.momentumTicks -= 1;
    return;
  }
  state.momentumTicks = 5 + Math.floor(uniform01() * 55);
  const sign = uniform01() < 0.5 ? -1 : 1;
  state.momentum = sign * (0.25 + uniform01() * 1.4);
}

function updateStochasticVol(state: TickerState) {
  const z = gaussianSample();
  const shock = Math.exp(0.18 * z - 0.012);
  state.currentVol = Math.min(
    state.baseVol * 2.8,
    Math.max(state.baseVol * 0.3, state.currentVol * shock),
  );
}

function sampleJumpReturn(): number {
  if (uniform01() > jumpProbability()) return 0;
  const sign = uniform01() < 0.5 ? -1 : 1;
  return sign * (0.006 + uniform01() * 0.038);
}

/** Demo-only stochastic marks (PERP_MARK_MODE=gbm). */
function microstructureStep(state: TickerState, dtSeconds: number): number {
  if (dtSeconds <= 0 || state.mark <= 0 || state.anchor <= 0) return state.mark;

  rollMomentum(state);
  updateStochasticVol(state);

  const dtYear = dtSeconds / (365.25 * 24 * 3600);
  const sigma = state.currentVol * volMultiplier();
  const z = gaussianSample();

  const momentumDrift = state.momentum * sigma * dtYear * 0.55;
  const diffusion = sigma * Math.sqrt(dtYear) * z;
  const jump = sampleJumpReturn();

  const logRatio = Math.log(state.mark / state.anchor);
  const meanRev =
    Math.abs(logRatio) > 0.03
      ? -meanReversionKappa() * logRatio * dtYear * Math.min(1.2, Math.abs(logRatio) / 0.04)
      : 0;

  let next = state.mark * Math.exp(momentumDrift + meanRev + diffusion + jump);

  const band = maxDeviationFraction();
  const deviation = (next - state.anchor) / state.anchor;
  if (Math.abs(deviation) > band * 0.82) {
    const overflow = Math.abs(deviation) - band * 0.82;
    const pushback = Math.tanh(overflow * 10) * (0.002 + uniform01() * 0.004) * next;
    next = deviation > 0 ? next - pushback : next + pushback;
  }

  return next;
}

function computeTwap(history: { price: number }[], window = twapWindow()): number {
  if (!history.length) return 0;
  const slice = history.slice(-window);
  return slice.reduce((sum, h) => sum + h.price, 0) / slice.length;
}

/**
 * Perp mark around stock index — stochastic vol, random mean-reversion speed, rare jumps.
 * Unpredictable tick-to-tick; still bounded and re-anchors when the real index moves.
 */
function basisDiffusionStep(state: TickerState, index: number, dtSeconds: number): number {
  const mark = state.mark > 0 ? state.mark : index;
  if (index <= 0) return mark > 0 ? mark : index;
  if (mark <= 0) return index;

  const baseVol = state.baseVol > 0 ? state.baseVol : getPerpBasisVol();
  const volShock = Math.exp(0.28 * gaussianSample() - 0.035);
  state.currentVol = Math.min(
    baseVol * 3,
    Math.max(baseVol * 0.25, state.currentVol * volShock),
  );

  const dtYear = dtSeconds / (365.25 * 24 * 3600);
  const sigma = state.currentVol * Math.sqrt(dtYear);
  const kappa = 32 * (0.7 + uniform01() * 0.65);
  const z = gaussianSample();

  let jump = 0;
  if (uniform01() < getPerpBasisJumpProb()) {
    const sign = uniform01() < 0.5 ? -1 : 1;
    jump = sign * (0.003 + uniform01() * 0.012);
  }

  const logMark = Math.log(mark);
  const logIndex = Math.log(index);
  const nextLog = logMark + -kappa * (logMark - logIndex) * dtYear + sigma * z + jump;
  const next = Math.exp(nextLog);

  const maxBasis = getPerpMaxBasisFraction();
  const floor = index * (1 - maxBasis);
  const cap = index * (1 + maxBasis);
  return Math.min(cap, Math.max(floor, next));
}

async function fetchAnchorPrice(ticker: string): Promise<number | null> {
  const index = await fetchStockIndexPrice(ticker);
  if (index) return index.price;

  try {
    const quote = await getFinnhubQuote(ticker);
    if (quote?.c && quote.c > 0) return quote.c;
  } catch {
    // fall through
  }

  try {
    const snap = await getMarketSnapshot(ticker);
    if (snap.mkt_price > 0) return snap.mkt_price;
  } catch {
    // fall through
  }

  hydrateSnapshotStore();
  const stored = getStoredSnapshot(ticker);
  if (stored?.mkt_price && stored.mkt_price > 0) return stored.mkt_price;

  return null;
}

function isLiveFinnhubQuote(quote: Awaited<ReturnType<typeof getFinnhubQuote>>): boolean {
  if (!quote?.c || quote.c <= 0 || !quote.t) return false;
  const ageMs = Date.now() - quote.t * 1000;
  return ageMs >= 0 && ageMs <= LIVE_QUOTE_MAX_AGE_MS;
}

function getOrInitState(ticker: string, seedPrice?: number): TickerState | null {
  const upper = ticker.toUpperCase();
  const existing = states.get(upper);
  if (existing) return existing;
  if (!seedPrice || seedPrice <= 0) return null;

  const restored = getRestoredMarkTicks(upper, 6 * 60 * 60_000);
  const basisVol = getPerpBasisVol();
  const now = Date.now();
  const initial: TickerState = {
    mark: seedPrice,
    anchor: seedPrice,
    mode: "frozen",
    lastAdvanceMs: now,
    lastAnchorRefreshMs: 0,
    lastLiveCheckMs: 0,
    baseVol: basisVol,
    currentVol: basisVol * (0.75 + uniform01() * 0.5),
    momentum: 0,
    momentumTicks: 0,
    sourceCount: 0,
    marketOpen: false,
    history:
      restored.length > 0
        ? restored.map((t) => ({ price: t.p, at: t.t }))
        : [{ price: seedPrice, at: now }],
  };
  states.set(upper, initial);
  return initial;
}

function toSnapshot(ticker: string, state: TickerState): PerpMarkSnapshot {
  const twap = computeTwap(state.history) || state.mark;
  return {
    ticker: ticker.toUpperCase(),
    price: state.mark,
    twapPrice: twap,
    anchorPrice: state.anchor,
    mode: state.mode,
    updatedAt: state.lastAdvanceMs,
    annualVol: state.currentVol,
    marketOpen: state.marketOpen,
    sourceCount: state.sourceCount,
  };
}

function pushHistory(state: TickerState, price: number, now: number, ticker: string) {
  state.history.push({ price, at: now });
  if (state.history.length > HISTORY_MAX) {
    state.history = state.history.slice(-HISTORY_MAX);
  }
  recordMarkSample(ticker, price, now);
}

/** Index-anchored perp mark: real stock index + bounded mean-reverting basis. */
async function advanceLiveIndexMark(
  state: TickerState,
  upper: string,
  now: number,
  dtSeconds: number,
): Promise<void> {
  const sessionOpen = isUsRegularSessionOpen(new Date(now));
  state.marketOpen = sessionOpen;

  const index = await fetchStockIndexPrice(upper);
  if (!index) {
    state.mode = state.mark > 0 ? "closed" : "frozen";
    return;
  }

  const prevIndex = state.anchor;
  state.sourceCount = index.sourceCount;
  state.anchor = index.price;

  if (state.mark <= 0) state.mark = index.price;

  if (prevIndex > 0 && Math.abs(index.price - prevIndex) / prevIndex > 0.00005) {
    const pull = 0.18 + uniform01() * 0.22;
    state.mark = state.mark * (1 - pull) + index.price * pull;
  }

  state.mark = basisDiffusionStep(state, index.price, dtSeconds);
  pushHistory(state, state.mark, now, upper);
  state.mode = sessionOpen ? "live" : "closed";
}

/** Demo stochastic marks — only when PERP_MARK_MODE=gbm. */
async function advanceGbmMark(state: TickerState, upper: string, now: number, dtSeconds: number): Promise<void> {
  state.marketOpen = isUsRegularSessionOpen(new Date(now));

  const shouldCheckLive = now - state.lastLiveCheckMs >= LIVE_CHECK_MS;
  if (shouldCheckLive) {
    state.lastLiveCheckMs = now;
    let liveQuote: Awaited<ReturnType<typeof getFinnhubQuote>> = null;
    try {
      liveQuote = await getFinnhubQuote(upper);
    } catch {
      liveQuote = null;
    }

    if (isLiveFinnhubQuote(liveQuote) && liveQuote) {
      state.anchor = liveQuote.c;
      state.mode = "live";
      const pull = 0.04 + uniform01() * 0.14;
      state.mark = state.mark * (1 - pull) + liveQuote.c * pull;
    }
  }

  if (now - state.lastAnchorRefreshMs >= ANCHOR_REFRESH_MS) {
    const refreshed = await fetchAnchorPrice(upper);
    if (refreshed && refreshed > 0) {
      state.anchor = refreshed * (1 + (uniform01() - 0.5) * 0.002);
      state.lastAnchorRefreshMs = now;
      if (state.history.length <= 1) state.mark = refreshed;
    }
  }

  state.mark = microstructureStep(state, dtSeconds);
  pushHistory(state, state.mark, now, upper);
  if (state.mode !== "live") state.mode = "gbm";
}

export function readPerpMarkSnapshot(ticker: string): PerpMarkSnapshot | null {
  const state = states.get(ticker.toUpperCase());
  if (!state) return null;
  return toSnapshot(ticker.toUpperCase(), state);
}

export async function advancePerpMark(ticker: string): Promise<PerpMarkSnapshot | null> {
  const upper = ticker.toUpperCase();
  let state = states.get(upper);

  if (!state) {
    const anchor = await fetchAnchorPrice(upper);
    if (!anchor) return null;
    state = getOrInitState(upper, anchor)!;
  }

  const now = Date.now();
  const dtSeconds = Math.min(300, Math.max(0.25, (now - state.lastAdvanceMs) / 1000));
  state.lastAdvanceMs = now;

  if (getPerpMarkEngineMode() === "live") {
    await advanceLiveIndexMark(state, upper, now, dtSeconds);
  } else {
    await advanceGbmMark(state, upper, now, dtSeconds);
  }

  return toSnapshot(upper, state);
}

export async function getPerpMarkSnapshot(ticker: string): Promise<PerpMarkSnapshot | null> {
  const cached = readPerpMarkSnapshot(ticker);
  if (cached && Date.now() - cached.updatedAt < MIN_ADVANCE_GAP_MS) {
    return cached;
  }
  return advancePerpMark(ticker);
}

export async function getPerpOracleMark(ticker: string): Promise<number | null> {
  const snap = readPerpMarkSnapshot(ticker) ?? (await advancePerpMark(ticker));
  return snap?.price ?? snap?.twapPrice ?? null;
}

export async function advanceAllPerpMarks(): Promise<number> {
  let count = 0;
  for (const ticker of PERP_MARKET_TICKERS) {
    const snap = await advancePerpMark(ticker);
    if (snap) count += 1;
  }
  return count;
}

export function getPerpMarkHistory(ticker: string, limit = HISTORY_MAX): { price: number; at: number }[] {
  const state = states.get(ticker.toUpperCase());
  if (!state) return [];
  const cap = Math.min(Math.max(1, limit), HISTORY_MAX);
  return state.history.slice(-cap);
}

function liveTicksFromState(ticker: string): { t: number; p: number }[] {
  return getPerpMarkHistory(ticker).map((h) => ({ t: h.at, p: h.price }));
}

export function getPerpMarkCandles(ticker: string, range: ChartRange): MarkCandle[] {
  const live = liveTicksFromState(ticker);
  return buildCandlesFromStored(ticker, range, live);
}

export function parseChartRange(value: string | null): ChartRange {
  const valid: ChartRange[] = ["5M", "15M", "1H", "4H", "1D", "1W", "1M", "3M"];
  return valid.includes(value as ChartRange) ? (value as ChartRange) : "15M";
}

export { getPerpMarkEngineMode };
