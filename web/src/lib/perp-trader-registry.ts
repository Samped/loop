import type { Address } from "viem";

/** In-memory registry of wallets with open perp positions (populated by UI + liquidator). */
const tradersByTicker = new Map<string, Set<string>>();

function normTicker(ticker: string) {
  return ticker.toUpperCase();
}

function normAddress(address: string) {
  return address.toLowerCase();
}

export function registerPerpTrader(ticker: string, address: string) {
  const t = normTicker(ticker);
  const a = normAddress(address);
  if (!tradersByTicker.has(t)) tradersByTicker.set(t, new Set());
  tradersByTicker.get(t)!.add(a);
}

export function unregisterPerpTrader(ticker: string, address: string) {
  tradersByTicker.get(normTicker(ticker))?.delete(normAddress(address));
}

export function getRegisteredPerpTraders(ticker: string): Address[] {
  const set = tradersByTicker.get(normTicker(ticker));
  if (!set?.size) return [];
  return [...set] as Address[];
}

export function getAllRegisteredPerpTraders(): Map<string, Address[]> {
  const out = new Map<string, Address[]>();
  for (const [ticker, set] of tradersByTicker) {
    if (set.size) out.set(ticker, [...set] as Address[]);
  }
  return out;
}
