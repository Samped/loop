import { arcTestnet, ARC_CHAIN_ID } from "@/lib/arc-chain";

export { ARC_CHAIN_ID };

export function isArcChain(chainId: number | undefined): boolean {
  return chainId === ARC_CHAIN_ID;
}

export const ARC_CHAIN_PARAMS = {
  chainId: `0x${ARC_CHAIN_ID.toString(16)}` as `0x${string}`,
  chainName: arcTestnet.name,
  nativeCurrency: arcTestnet.nativeCurrency,
  rpcUrls: arcTestnet.rpcUrls.default.http,
  blockExplorerUrls: [arcTestnet.blockExplorers.default.url],
} as const;

export const ARC_EXPLORER_URL = arcTestnet.blockExplorers.default.url;

export function getArcExplorerTxUrl(txHash: string): string {
  return `${ARC_EXPLORER_URL}/tx/${txHash}`;
}
