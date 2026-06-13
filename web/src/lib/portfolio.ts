import {
  createPublicClient,
  formatUnits,
  http,
  type Address,
} from "viem";
import { arcTestnet } from "@/lib/arc-chain";
import { batchContractReads } from "@/lib/batch-contract-reads";
import { getVaultReserveStatus, type VaultReserveStatus } from "@/lib/vault-reserve";
import { getStockVaultAddress } from "@/lib/config";
import { stockVaultAbi } from "@/lib/contracts/stock-vault";
import { getContractPrices } from "@/lib/contract-prices";
import { contractPriceToSnapshot } from "@/lib/snapshot-utils";
import { ARC_USDC_ADDRESS, erc20Abi } from "@/lib/usdc";
import type { CryptoStock, Kline, MarketSnapshot } from "@/lib/sosovalue";

const READ_BATCH = 25;
const SHARE_DECIMALS = 18;

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
  history: PortfolioHistoryPoint[];
  reserve: VaultReserveStatus;
};

export type KlineGetter = (ticker: string) => Kline[] | undefined;

function getClient() {
  return createPublicClient({ chain: arcTestnet, transport: http() });
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
}: {
  address: string;
  stocks: CryptoStock[];
  snapshots: Record<string, MarketSnapshot>;
  holdingsRaw: Record<string, bigint>;
  klinesByTicker: Record<string, Kline[]>;
  usdcBalance: bigint;
  reserve: VaultReserveStatus;
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
    history,
    reserve,
  };
}

export async function getPortfolioForAddress(
  address: Address,
  stocks: CryptoStock[],
  snapshots: Record<string, MarketSnapshot>,
  getKlines: KlineGetter,
): Promise<PortfolioData> {
  const client = getClient();
  const tickersToScan = stocks.map((s) => s.ticker);
  const stockMap = new Map(stocks.map((s) => [s.ticker, s]));

  const [holdingsRaw, usdcBalance, reserve] = await Promise.all([
    fetchHoldingsForUser(address, tickersToScan),
    client.readContract({
      address: ARC_USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    }),
    getVaultReserveStatus(),
  ]);

  const enrichedSnapshots = await enrichSnapshotsForHoldings(holdingsRaw, snapshots);
  const heldTickers = Object.keys(holdingsRaw);
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
  });
}
