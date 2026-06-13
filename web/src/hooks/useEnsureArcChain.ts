"use client";

import { useCallback } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { ARC_CHAIN_ID, isArcChain } from "@/lib/arc-chain-utils";

export function useEnsureArcChain() {
  const { chainId } = useAccount();
  const { switchChainAsync, isPending } = useSwitchChain();

  const onArc = isArcChain(chainId);

  const ensureArc = useCallback(async () => {
    if (isArcChain(chainId)) return;
    await switchChainAsync({ chainId: ARC_CHAIN_ID });
  }, [chainId, switchChainAsync]);

  return { onArc, ensureArc, isSwitching: isPending, chainId };
}
