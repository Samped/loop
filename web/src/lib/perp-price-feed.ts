import type { PerpMarkMode } from "@/lib/perp-mark-engine";
import { getPerpMarkSnapshot, getPerpOracleMark } from "@/lib/perp-mark-engine";

export type PerpMarkPriceSource = "live" | "gbm" | "closed" | "frozen";

export type PerpMarkPrice = {
  ticker: string;
  price: number;
  twapPrice: number;
  basePrice: number;
  source: PerpMarkPriceSource;
  simulated: boolean;
};

function mapMode(mode: PerpMarkMode): PerpMarkPriceSource {
  return mode;
}

/** Current settlement mark from the server mark engine (read-only). */
export function getPerpMarkPrice(ticker: string): PerpMarkPrice | null {
  const snap = getPerpMarkSnapshot(ticker);
  if (!snap) return null;

  return {
    ticker: snap.ticker,
    price: snap.price,
    twapPrice: snap.twapPrice,
    basePrice: snap.anchorPrice,
    source: mapMode(snap.mode),
    simulated: snap.mode === "gbm",
  };
}

/** TWAP-smoothed mark for on-chain oracle updates. */
export async function getPerpMarkPriceForOracle(ticker: string): Promise<number | null> {
  return getPerpOracleMark(ticker);
}
