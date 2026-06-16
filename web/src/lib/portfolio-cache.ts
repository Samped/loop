import type { Address } from "viem";
import type { CryptoStock, MarketSnapshot } from "@/lib/sosovalue";
import {
  getPortfolioForAddress,
  type KlineGetter,
  type PortfolioData,
} from "@/lib/portfolio";

const CACHE_TTL_MS = 5_000;

const cache = new Map<string, { at: number; data: PortfolioData }>();
const inflight = new Map<string, Promise<PortfolioData>>();

export async function getCachedPortfolioForAddress(
  address: Address,
  stocks: CryptoStock[],
  snapshots: Record<string, MarketSnapshot>,
  getKlines: KlineGetter,
): Promise<PortfolioData> {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.data;
  }

  let pending = inflight.get(key);
  if (!pending) {
    pending = getPortfolioForAddress(address, stocks, snapshots, getKlines)
      .then((data) => {
        cache.set(key, { at: Date.now(), data });
        inflight.delete(key);
        return data;
      })
      .catch((err) => {
        inflight.delete(key);
        throw err;
      });
    inflight.set(key, pending);
  }

  return pending;
}
