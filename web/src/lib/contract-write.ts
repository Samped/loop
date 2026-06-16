import type { Address, PublicClient } from "viem";

/** Pending nonce from the chain — use between back-to-back wallet writes. */
export async function getPendingNonce(
  publicClient: PublicClient,
  address: Address,
): Promise<number> {
  return publicClient.getTransactionCount({ address, blockTag: "pending" });
}
