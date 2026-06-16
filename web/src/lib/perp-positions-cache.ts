import type { Address } from "viem";
import type { CryptoStock } from "@/lib/sosovalue";
import { getPerpPositionsForAddress, type PortfolioPerpPosition } from "@/lib/portfolio";
import { withTimeout } from "@/lib/async-timeout";

const CACHE_TTL_MS = 8_000;
const FETCH_TIMEOUT_MS = 10_000;

const cache = new Map<string, { at: number; data: PortfolioPerpPosition[] }>();
const inflight = new Map<string, Promise<PortfolioPerpPosition[]>>();

export async function getCachedPerpPositionsForAddress(
  address: Address,
  stocks: CryptoStock[],
): Promise<PortfolioPerpPosition[]> {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.data;
  }

  let pending = inflight.get(key);
  if (!pending) {
    pending = withTimeout(getPerpPositionsForAddress(address, stocks), FETCH_TIMEOUT_MS)
      .then((data) => {
        const positions = data ?? [];
        cache.set(key, { at: Date.now(), data: positions });
        inflight.delete(key);
        return positions;
      })
      .catch(() => {
        inflight.delete(key);
        return hit?.data ?? [];
      });
    inflight.set(key, pending);
  }

  return pending;
}
