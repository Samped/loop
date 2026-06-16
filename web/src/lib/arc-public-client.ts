import { createPublicClient, http, type PublicClient } from "viem";
import { arcTestnet } from "@/lib/arc-chain";

const RPC_TIMEOUT_MS = 8_000;

let client: PublicClient | null = null;

export function getArcPublicClient(): PublicClient {
  if (!client) {
    const url = arcTestnet.rpcUrls.default.http[0]!;
    client = createPublicClient({
      chain: arcTestnet,
      transport: http(url, { timeout: RPC_TIMEOUT_MS }),
    });
  }
  return client;
}
