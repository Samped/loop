"use client";

import { useQuery } from "@tanstack/react-query";
import { getPerpContractAbi } from "@/lib/contracts/perp-engine";

export function usePerpContractConfig() {
  const query = useQuery({
    queryKey: ["perp-contract-config"],
    queryFn: async () => {
      const res = await fetch("/api/perp/config");
      if (!res.ok) throw new Error("Failed to load perp config");
      return res.json() as Promise<{ address: `0x${string}` | null; perpMode: boolean }>;
    },
    staleTime: 30_000,
  });

  return {
    ...query,
    contractAddress: query.data?.address ?? null,
    perpContractAbi: getPerpContractAbi(),
    contractReady: Boolean(query.data?.address),
  };
}
