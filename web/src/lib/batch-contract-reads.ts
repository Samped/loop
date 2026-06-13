import type { Abi, Address, PublicClient } from "viem";

type ReadItem = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
};

type ReadResult<TResult> =
  | { status: "success"; result: TResult }
  | { status: "failure"; error: unknown };

/** Parallel contract reads — works on chains without Multicall3 (e.g. Arc Testnet). */
export async function batchContractReads<TResult>(
  client: PublicClient,
  items: ReadItem[],
  concurrency = 20,
): Promise<ReadResult<TResult>[]> {
  const results: ReadResult<TResult>[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map((item) =>
        client.readContract({
          address: item.address,
          abi: item.abi,
          functionName: item.functionName,
          args: item.args,
        }),
      ),
    );

    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        results.push({ status: "success", result: outcome.value as TResult });
      } else {
        results.push({ status: "failure", error: outcome.reason });
      }
    }
  }

  return results;
}
