import type { Kline, MarketSnapshot } from "@/lib/sosovalue";
import { getStoredKlines, getStoredSnapshot } from "@/lib/snapshot-store";

/** True when snapshot came from SoSoValue (not on-chain price fallback). */
export function isFullSnapshot(snap: MarketSnapshot): boolean {
  return snap.mkt_price > 0 && snap.total_marketcap > 0;
}

/** Stock has live price data — can show in list and trade. */
export function isStockListed(ticker: string): boolean {
  const snap = getStoredSnapshot(ticker);
  return Boolean(snap && isFullSnapshot(snap));
}

/** Stock has price + chart — chart page is available. */
export function isStockReady(ticker: string): boolean {
  const snap = getStoredSnapshot(ticker);
  const klines = getStoredKlines(ticker);
  return Boolean(snap && isFullSnapshot(snap) && klines && klines.length > 0);
}

export function filterListedSnapshots(snapshots: Record<string, MarketSnapshot>): Record<string, MarketSnapshot> {
  const listed: Record<string, MarketSnapshot> = {};
  for (const [ticker, snap] of Object.entries(snapshots)) {
    if (isFullSnapshot(snap)) listed[ticker] = snap;
  }
  return listed;
}

export type ListedStockPayload = {
  ticker: string;
  snapshot: MarketSnapshot;
};

export type ReadyStockPayload = ListedStockPayload & {
  klines: Kline[];
};
