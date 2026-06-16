import type { QueryClient } from "@tanstack/react-query";
import { refreshAllBalances } from "@/lib/balance-refresh";

/** Refetch wallet USDC, holdings, and portfolio after a confirmed trade. */
export function invalidateTradeBalances(queryClient: QueryClient) {
  refreshAllBalances(queryClient);
}
