import { useAccount, useReadContract } from "wagmi";
import { ARC_CHAIN_ID } from "@/lib/arc-chain-utils";
import { ARC_USDC_ADDRESS, erc20Abi } from "@/lib/usdc";

export function useUsdcBalance({ enabled = true }: { enabled?: boolean } = {}) {
  const { address } = useAccount();

  return useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: enabled && Boolean(address) },
  });
}
