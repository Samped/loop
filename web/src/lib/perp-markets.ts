/** Tickers with configured PerpEngine markets (see DeployPerp.s.sol). */
export const PERP_MARKET_TICKERS = ["MSTR", "COIN", "HOOD", "MARA", "RIOT"] as const;

export type PerpMarketTicker = (typeof PERP_MARKET_TICKERS)[number];
