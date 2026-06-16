import type { QueryClient } from "@tanstack/react-query";

/** How often on-chain wallet / holdings reads refresh while connected. */
export const BALANCE_REFETCH_MS = 5_000;

export const PORTFOLIO_REFRESH_EVENT = "loop:portfolio-refresh";

export function notifyPortfolioRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PORTFOLIO_REFRESH_EVENT));
}

/** Refetch wallet USDC, vault holdings, and portfolio aggregates. */
export function refreshAllBalances(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["readContract"] });
  notifyPortfolioRefresh();
}
