import {
  createPublicClient,
  formatUnits,
  http,
  type Address,
} from "viem";
import { arcTestnet } from "@/lib/arc-chain";
import { batchContractReads } from "@/lib/batch-contract-reads";
import { getVaultReserveStatus, type VaultReserveStatus } from "@/lib/vault-reserve";
import { getPerpEngineAddress, getStockVaultAddress } from "@/lib/config";
import { perpEngineAbi } from "@/lib/contracts/perp-engine";
import { stockVaultAbi } from "@/lib/contracts/stock-vault";
import { parsePerpSide, type PerpSide } from "@/lib/perp";
import { readPerpMarkSnapshot } from "@/lib/perp-mark-engine";
import { PERP_MARKET_TICKERS } from "@/lib/perp-markets";
import { getContractPrices } from "@/lib/contract-prices";
import { contractPriceToSnapshot } from "@/lib/snapshot-utils";
import { ARC_USDC_ADDRESS, erc20Abi } from "@/lib/usdc";
import type { CryptoStock, Kline, MarketSnapshot } from "@/lib/sosovalue";

const READ_BATCH = 25;
const SHARE_DECIMALS = 18;
const SPOT_DISCOVERY_TTL_MS = 5 * 60_000;

const spotDiscoveryCache = new Map<string, { at: number; tickers: string[] }>();

export type PortfolioPosition = {
  ticker: string;
  name: string;
  shares: number;
  price: number;
  value: number;
  allocation: number;
  dayChangePct: number;
  dayPnl: number;
  periodChangePct: number;
  sparkline: number[];
};

export type PortfolioPerpPosition = {
  ticker: string;
  name: string;
  side: Exclude<PerpSide, "none">;
  size: number;
  margin: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  equity: number;
};

export type PortfolioHistoryPoint = {
  timestamp: number;
  value: number;
};

export type PortfolioData = {
  address: string;
  usdcBalance: number;
  totalValue: number;
  totalDayPnl: number;
  totalDayPnlPct: number;
  periodPnl: number;
  periodPnlPct: number;
  positions: PortfolioPosition[];
  perpPositions: PortfolioPerpPosition[];
  history: PortfolioHistoryPoint[];
  reserve: VaultReserveStatus;
};

type PerpPositionRaw = readonly [
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
];

export type KlineGetter = (ticker: string) => Kline[] | undefined;

function getClient() {
  return createPublicClient({ chain: arcTestnet, transport: http() });
}

async function discoverHeldSpotTickers(
  address: Address,
  stocks: CryptoStock[],
  snapshots: Record<string, MarketSnapshot>,
  vault = getStockVaultAddress(),
): Promise<string[]> {
  if (!vault) return [];

  const cacheKey = address.toLowerCase();
  const cached = spotDiscoveryCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SPOT_DISCOVERY_TTL_MS) {
    return cached.tickers;
  }

  const candidates = stocks
    .map((s) => s.ticker)
    .filter((ticker) => (snapshots[ticker]?.mkt_price ?? 0) > 0);

  let held: string[] = [];
  if (candidates.length > 0) {
    const holdings = await fetchHoldingsForUser(address, candidates, vault);
    held = Object.keys(holdings);
  }

  spotDiscoveryCache.set(cacheKey, { at: Date.now(), tickers: held });
  return held;
}

export async function fetchHoldingsForUser(
  address: Address,
  tickers: string[],
  contract = getStockVaultAddress(),
): Promise<Record<string, bigint>> {
  if (!contract || tickers.length === 0) return {};

  const client = getClient();
  const holdings: Record<string, bigint> = {};

  for (let i = 0; i < tickers.length; i += READ_BATCH) {
    const batch = tickers.slice(i, i + READ_BATCH);
    const items = batch.map((ticker) => ({
      address: contract,
      abi: stockVaultAbi,
      functionName: "getHoldings" as const,
      args: [address, ticker] as const,
    }));

    const results = await batchContractReads<bigint>(client, items, READ_BATCH);
    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      if (result.status === "success" && result.result > 0n) {
        holdings[batch[j]] = result.result;
      }
    }
  }

  return holdings;
}

async function fetchPerpPositionsForUser(
  address: Address,
  tickers: string[],
  contract = getPerpEngineAddress(),
): Promise<Record<string, PerpPositionRaw>> {
  if (!contract || tickers.length === 0) return {};

  const client = getClient();
  const positions: Record<string, PerpPositionRaw> = {};

  for (let i = 0; i < tickers.length; i += READ_BATCH) {
    const batch = tickers.slice(i, i + READ_BATCH);
    const items = batch.map((ticker) => ({
      address: contract,
      abi: perpEngineAbi,
      functionName: "getPosition" as const,
      args: [address, ticker] as const,
    }));

    const results = await batchContractReads<PerpPositionRaw>(client, items, READ_BATCH);
    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      if (result.status === "success" && Number(result.result[0]) !== 0) {
        positions[batch[j]] = result.result;
      }
    }
  }

  return positions;
}

export function buildPerpPositions(
  perpRaw: Record<string, PerpPositionRaw>,
  stocks: CryptoStock[],
  snapshots: Record<string, MarketSnapshot>,
  liveMarks: Record<string, number> = {},
): PortfolioPerpPosition[] {
  const stockMap = new Map(stocks.map((s) => [s.ticker, s]));
  const positions: PortfolioPerpPosition[] = [];

  for (const [ticker, raw] of Object.entries(perpRaw)) {
    const side = parsePerpSide(Number(raw[0]));
    if (side === "none") continue;

    const size = Number(formatUnits(raw[1], SHARE_DECIMALS));
    const entryPrice = Number(raw[3]) / 1e6;
    const margin = Number(raw[2]) / 1e6;
    const markPrice = liveMarks[ticker] ?? snapshots[ticker]?.mkt_price ?? entryPrice;
    const onChainPnl = Number(raw[4]) / 1e6;
    const computedPnl =
      side === "long" ? (markPrice - entryPrice) * size : (entryPrice - markPrice) * size;
    const unrealizedPnl = liveMarks[ticker] != null ? computedPnl : onChainPnl;

    positions.push({
      ticker,
      name: stockMap.get(ticker)?.name ?? ticker,
      side,
      size,
      margin,
      entryPrice,
      markPrice,
      unrealizedPnl,
      equity: margin + unrealizedPnl,
    });
  }

  positions.sort((a, b) => b.equity - a.equity);
  return positions;
}

async function enrichSnapshotsForHoldings(
  holdingsRaw: Record<string, bigint>,
  snapshots: Record<string, MarketSnapshot>,
): Promise<Record<string, MarketSnapshot>> {
  const enriched = { ...snapshots };
  const missing = Object.keys(holdingsRaw).filter((ticker) => !enriched[ticker]?.mkt_price);

  if (missing.length === 0) return enriched;

  try {
    const contractPrices = await getContractPrices(missing);
    for (const ticker of missing) {
      const price = contractPrices[ticker];
      if (price && price > 0n) {
        enriched[ticker] = contractPriceToSnapshot(ticker, price);
      }
    }
  } catch {
    // Positions still show with $0 value if price lookup fails
  }

  return enriched;
}

function analyzeKlines(bars: Kline[]) {
  if (bars.length < 2) {
    return { dayChangePct: 0, dayPnlPerShare: 0, periodChangePct: 0, sparkline: [] as number[] };
  }
  const last = bars[bars.length - 1].close;
  const prev = bars[bars.length - 2].close;
  const first = bars[0].close;
  const dayChangePct = prev > 0 ? ((last - prev) / prev) * 100 : 0;
  const dayPnlPerShare = last - prev;
  const periodChangePct = first > 0 ? ((last - first) / first) * 100 : 0;
  const sparkline = bars.slice(-14).map((b) => b.close);
  return { dayChangePct, dayPnlPerShare, periodChangePct, sparkline };
}

function buildPortfolioHistory(
  positions: Array<{ ticker: string; shares: number }>,
  klinesByTicker: Record<string, Kline[]>,
): PortfolioHistoryPoint[] {
  if (positions.length === 0) return [];

  const timestamps = new Set<number>();
  for (const pos of positions) {
    for (const bar of klinesByTicker[pos.ticker] ?? []) {
      timestamps.add(bar.timestamp);
    }
  }

  const sorted = [...timestamps].sort((a, b) => a - b);
  const lastClose: Record<string, number> = {};

  return sorted
    .map((timestamp) => {
      let value = 0;
      for (const pos of positions) {
        const bars = klinesByTicker[pos.ticker];
        if (!bars?.length) continue;
        const bar = bars.find((k) => k.timestamp === timestamp);
        if (bar) lastClose[pos.ticker] = bar.close;
        if (lastClose[pos.ticker] != null) {
          value += pos.shares * lastClose[pos.ticker];
        }
      }
      return { timestamp, value };
    })
    .filter((p) => p.value > 0);
}

export function buildPortfolioData({
  address,
  stocks,
  snapshots,
  holdingsRaw,
  klinesByTicker,
  usdcBalance,
  reserve,
  perpRaw = {},
  livePerpMarks = {},
}: {
  address: string;
  stocks: CryptoStock[];
  snapshots: Record<string, MarketSnapshot>;
  holdingsRaw: Record<string, bigint>;
  klinesByTicker: Record<string, Kline[]>;
  usdcBalance: bigint;
  reserve: VaultReserveStatus;
  perpRaw?: Record<string, PerpPositionRaw>;
  livePerpMarks?: Record<string, number>;
}): PortfolioData {
  const stockMap = new Map(stocks.map((s) => [s.ticker, s]));
  const positions: PortfolioPosition[] = [];

  for (const [ticker, sharesRaw] of Object.entries(holdingsRaw)) {
    const shares = Number(formatUnits(sharesRaw, SHARE_DECIMALS));
    const snap = snapshots[ticker];
    const price = snap?.mkt_price ?? 0;
    const value = shares * price;
    const bars = klinesByTicker[ticker] ?? [];
    const { dayChangePct, dayPnlPerShare, periodChangePct, sparkline } = analyzeKlines(bars);

    positions.push({
      ticker,
      name: stockMap.get(ticker)?.name ?? ticker,
      shares,
      price,
      value,
      allocation: 0,
      dayChangePct,
      dayPnl: shares * dayPnlPerShare,
      periodChangePct,
      sparkline,
    });
  }

  positions.sort((a, b) => b.value - a.value);
  const totalValue = positions.reduce((sum, p) => sum + p.value, 0);
  const totalDayPnl = positions.reduce((sum, p) => sum + p.dayPnl, 0);

  for (const p of positions) {
    p.allocation = totalValue > 0 ? (p.value / totalValue) * 100 : 0;
  }

  const history = buildPortfolioHistory(
    positions.map((p) => ({ ticker: p.ticker, shares: p.shares })),
    klinesByTicker,
  );

  let periodPnl = 0;
  let periodPnlPct = 0;
  if (history.length >= 2) {
    const start = history[0].value;
    const end = history[history.length - 1].value;
    periodPnl = end - start;
    periodPnlPct = start > 0 ? (periodPnl / start) * 100 : 0;
  }

  const prevTotal = totalValue - totalDayPnl;
  const totalDayPnlPct = prevTotal > 0 ? (totalDayPnl / prevTotal) * 100 : 0;

  return {
    address,
    usdcBalance: Number(formatUnits(usdcBalance, 6)),
    totalValue,
    totalDayPnl,
    totalDayPnlPct,
    periodPnl,
    periodPnlPct,
    positions,
    perpPositions: buildPerpPositions(perpRaw, stocks, snapshots, livePerpMarks),
    history,
    reserve,
  };
}

export async function getPerpPositionsForAddress(
  address: Address,
  stocks: CryptoStock[],
  snapshots: Record<string, MarketSnapshot> = {},
): Promise<PortfolioPerpPosition[]> {
  const perpRaw = await fetchPerpPositionsForUser(address, [...PERP_MARKET_TICKERS]);
  const livePerpMarks: Record<string, number> = {};
  for (const ticker of Object.keys(perpRaw)) {
    const snap = readPerpMarkSnapshot(ticker);
    if (snap) livePerpMarks[ticker] = snap.price;
  }
  return buildPerpPositions(perpRaw, stocks, snapshots, livePerpMarks);
}

export async function getPortfolioForAddress(
  address: Address,
  stocks: CryptoStock[],
  snapshots: Record<string, MarketSnapshot>,
  getKlines: KlineGetter,
): Promise<PortfolioData> {
  const client = getClient();
  const stockMap = new Map(stocks.map((s) => [s.ticker, s]));
  const perpTickers = [...PERP_MARKET_TICKERS];

  const [heldSpotTickers, perpRaw, usdcBalance, reserve] = await Promise.all([
    discoverHeldSpotTickers(address, stocks, snapshots),
    fetchPerpPositionsForUser(address, perpTickers),
    client.readContract({
      address: ARC_USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    }),
    getVaultReserveStatus(),
  ]);

  const holdingsRaw =
    heldSpotTickers.length > 0
      ? await fetchHoldingsForUser(address, heldSpotTickers)
      : {};

  const enrichedSnapshots = await enrichSnapshotsForHoldings(holdingsRaw, snapshots);

  const livePerpMarks: Record<string, number> = {};
  for (const ticker of Object.keys(perpRaw)) {
    const snap = readPerpMarkSnapshot(ticker);
    if (snap) livePerpMarks[ticker] = snap.price;
  }

  const heldTickers = [...new Set([...Object.keys(holdingsRaw), ...Object.keys(perpRaw)])];
  const catalog = heldTickers.map(
    (t) => stockMap.get(t) ?? { ticker: t, name: t, exchange: "", sector: "", introduction: "", listing_time: "" },
  );

  const klinesByTicker: Record<string, Kline[]> = {};
  for (const ticker of heldTickers) {
    const kl = getKlines(ticker);
    if (kl?.length) klinesByTicker[ticker] = kl;
  }

  return buildPortfolioData({
    address,
    stocks: catalog.length > 0 ? catalog : stocks,
    snapshots: enrichedSnapshots,
    holdingsRaw,
    klinesByTicker,
    usdcBalance,
    reserve,
    perpRaw,
    livePerpMarks,
  });
}
