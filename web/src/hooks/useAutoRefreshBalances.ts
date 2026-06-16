"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { BALANCE_REFETCH_MS, refreshAllBalances } from "@/lib/balance-refresh";

/** Keeps wallet USDC and contract holdings fresh app-wide while connected. */
export function useAutoRefreshBalances() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isConnected || !address) return;

    const tick = () => refreshAllBalances(queryClient);

    tick();
    const interval = setInterval(tick, BALANCE_REFETCH_MS);

    const onFocus = () => tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isConnected, address, queryClient]);
}
