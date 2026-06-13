import type { QueryClient } from "@tanstack/react-query";

/** Refetch wallet USDC and vault holdings after a confirmed trade. */
export function invalidateTradeBalances(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["readContract"] });
}
