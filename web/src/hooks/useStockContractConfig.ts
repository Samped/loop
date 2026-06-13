"use client";

import { useQuery } from "@tanstack/react-query";
import { getStockContractAbi } from "@/lib/contracts/active";

type ContractConfig = {
  address: `0x${string}` | null;
  vaultMode: boolean;
};

export function useStockContractConfig() {
  const query = useQuery({
    queryKey: ["contract-config"],
    queryFn: async (): Promise<ContractConfig> => {
      const res = await fetch("/api/contract/config");
      if (!res.ok) throw new Error("Failed to load contract config");
      return res.json();
    },
    staleTime: 30_000,
  });

  const contractAddress = query.data?.address ?? null;
  const stockContractAbi = getStockContractAbi();

  return {
    ...query,
    contractAddress,
    vaultMode: Boolean(contractAddress),
    stockContractAbi,
    contractReady: contractAddress !== null,
  };
}
