/** Tickers with configured PerpEngine markets (see DeployPerp.s.sol). */
export const PERP_MARKET_TICKERS = ["MSTR", "COIN", "HOOD", "MARA", "RIOT"] as const;

export type PerpMarketTicker = (typeof PERP_MARKET_TICKERS)[number];

const PERP_SET = new Set<string>(PERP_MARKET_TICKERS);

export function isPerpMarketTicker(ticker: string): ticker is PerpMarketTicker {
  return PERP_SET.has(ticker.toUpperCase());
}

export function filterPerpMarketTickers(tickers: string[]): PerpMarketTicker[] {
  const out: PerpMarketTicker[] = [];
  for (const raw of tickers) {
    const upper = raw.trim().toUpperCase();
    if (isPerpMarketTicker(upper) && !out.includes(upper)) {
      out.push(upper);
    }
  }
  return out;
}
