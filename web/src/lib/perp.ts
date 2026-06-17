import { getPerpEngineAddress } from "@/lib/config";
import { perpEngineAbi } from "@/lib/contracts/perp-engine";

export function getPerpContractAddress(): `0x${string}` | null {
  const addr = process.env.NEXT_PUBLIC_PERP_ENGINE_ADDRESS as `0x${string}` | undefined;
  if (addr && addr !== "0x0000000000000000000000000000000000000000") {
    return addr;
  }
  return getPerpEngineAddress();
}

export function getPerpContractAbi() {
  return perpEngineAbi;
}

export type PerpSide = "none" | "long" | "short";

export type PerpPosition = {
  side: PerpSide;
  size: bigint;
  margin: bigint;
  entryPrice: bigint;
  unrealizedPnl: bigint;
  equity: bigint;
  liquidationPrice: bigint;
};

export function parsePerpSide(side: number): PerpSide {
  if (side === 1) return "long";
  if (side === 2) return "short";
  return "none";
}

/** PerpEngine MAX_ORACLE_STALENESS — keep a small buffer before expiry. */
export const PERP_ORACLE_STALE_SEC = 280;

export function isPerpOracleStale(lastMarkUpdateSec: bigint | number, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const updated = typeof lastMarkUpdateSec === "bigint" ? Number(lastMarkUpdateSec) : lastMarkUpdateSec;
  if (!updated) return true;
  return nowSec > updated + PERP_ORACLE_STALE_SEC;
}

/** Slightly undersize so a mark tick between sign and mine does not exceed max leverage. */
export function shrinkOpenSizeForExecution(sizeShares: bigint): bigint {
  if (sizeShares <= 0n) return 0n;
  const shrunk = (sizeShares * 99n) / 100n;
  return shrunk > 0n ? shrunk : sizeShares;
}

export function sizeFromMargin(marginUsdc6: bigint, leverage: number, priceUsdc6: bigint): bigint {
  if (priceUsdc6 === 0n || leverage <= 0) return 0n;
  const notional = marginUsdc6 * BigInt(leverage);
  return (notional * SHARE_UNIT) / priceUsdc6;
}

/** Max size the contract accepts at the on-chain mark (integer-safe). */
export function maxOpenSizeShares(
  marginUsdc6: bigint,
  markPriceUsdc6: bigint,
  maxLeverage: number,
): bigint {
  if (markPriceUsdc6 === 0n || marginUsdc6 === 0n || maxLeverage <= 0) return 0n;
  const maxNotional = marginUsdc6 * BigInt(maxLeverage);
  return (maxNotional * SHARE_UNIT) / markPriceUsdc6;
}

/** Size for openPosition — uses on-chain mark and satisfies PerpEngine margin checks. */
export function openSizeFromMargin(
  marginUsdc6: bigint,
  leverage: number,
  markPriceUsdc6: bigint,
  maxLeverage: number,
): bigint {
  if (markPriceUsdc6 === 0n || marginUsdc6 === 0n || leverage <= 0 || maxLeverage <= 0) return 0n;

  const lev = Math.min(leverage, maxLeverage);
  let size = sizeFromMargin(marginUsdc6, lev, markPriceUsdc6);
  const cap = maxOpenSizeShares(marginUsdc6, markPriceUsdc6, maxLeverage);
  if (size > cap) size = cap;

  const maxLevB = BigInt(maxLeverage);
  while (size > 0n) {
    const notional = notionalUsd(size, markPriceUsdc6);
    if (marginUsdc6 >= notional / maxLevB && notional / marginUsdc6 <= maxLevB) {
      return size;
    }
    size -= 10n ** 14n;
  }
  return 0n;
}

export function notionalUsd(sizeShares: bigint, priceUsdc6: bigint): bigint {
  return (sizeShares * priceUsdc6) / 10n ** 18n;
}

export function effectiveLeverage(sizeShares: bigint, priceUsdc6: bigint, marginUsdc6: bigint): number {
  if (marginUsdc6 === 0n) return 0;
  const notional = notionalUsd(sizeShares, priceUsdc6);
  return Number(notional) / Number(marginUsdc6);
}

export function formatPerpPnl(pnl6: bigint): string {
  const abs = pnl6 < 0n ? -pnl6 : pnl6;
  const dollars = Number(abs) / 1e6;
  const sign = pnl6 < 0n ? "-" : "+";
  return `${sign}$${dollars.toFixed(2)}`;
}

const BPS = 10_000n;
const SHARE_UNIT = 10n ** 18n;

/** Client-side unrealized P&L from live mark (updates every tick). */
export function computeUnrealizedPnlUsdc6(
  side: PerpSide,
  size: bigint,
  entryPriceUsdc6: bigint,
  markPriceUsdc6: bigint,
): bigint {
  if (side === "none" || size === 0n || markPriceUsdc6 === 0n) return 0n;
  if (side === "long") {
    return ((markPriceUsdc6 - entryPriceUsdc6) * size) / SHARE_UNIT;
  }
  return ((entryPriceUsdc6 - markPriceUsdc6) * size) / SHARE_UNIT;
}

export function formatPnlUsd(pnlUsd: number): string {
  const sign = pnlUsd >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(pnlUsd).toFixed(2)}`;
}

/** Mirrors PerpEngine._liquidationPrice — used when on-chain long liq returns 0 (deployed bug). */
export function computeLiquidationPrice(
  side: PerpSide,
  size: bigint,
  margin: bigint,
  entryPrice: bigint,
  maintenanceMarginBps: number,
): bigint | null {
  if (side === "none" || size === 0n || entryPrice === 0n) return null;

  const mm = BigInt(maintenanceMarginBps);
  const e = entryPrice;
  const sz = size;
  const m = margin;

  if (side === "long") {
    const esz = e * sz;
    const mScaled = m * SHARE_UNIT;
    if (esz <= mScaled) return 0n;
    const denom = sz * (BPS - mm);
    if (denom === 0n) return null;
    return (esz - mScaled) * BPS / denom;
  }

  const denom = sz * (BPS + mm);
  if (denom === 0n) return null;
  return (m * SHARE_UNIT + e * sz) * BPS / denom;
}

export function formatLiquidationPrice(priceUsdc6: bigint | null): string {
  if (priceUsdc6 == null || priceUsdc6 === 0n) return "—";
  return `$${(Number(priceUsdc6) / 1e6).toFixed(2)}`;
}

/** Maintenance margin required at the current oracle mark (matches PerpEngine). */
export function computeMaintenanceUsdc6(
  size: bigint,
  markPriceUsdc6: bigint,
  maintenanceMarginBps: number,
): bigint {
  if (size === 0n || markPriceUsdc6 === 0n) return 0n;
  const notional = notionalUsd(size, markPriceUsdc6);
  return (notional * BigInt(maintenanceMarginBps)) / BPS;
}

/** Price where equity hits zero (full margin lost) — for display only. */
export function computeFullMarginLossPriceUsdc6(
  side: PerpSide,
  size: bigint,
  margin: bigint,
  entryPrice: bigint,
): bigint | null {
  if (side === "none" || size === 0n || entryPrice === 0n) return null;
  if (side === "long") {
    const drop = (margin * SHARE_UNIT) / size;
    return entryPrice > drop ? entryPrice - drop : 0n;
  }
  return entryPrice + (margin * SHARE_UNIT) / size;
}

/** How much margin is lost when liquidated (equity = maintenance at liq price). */
export function computeLossAtLiquidationUsdc6(
  margin: bigint,
  size: bigint,
  liquidationPriceUsdc6: bigint,
  maintenanceMarginBps: number,
): bigint {
  const maintenance = computeMaintenanceUsdc6(size, liquidationPriceUsdc6, maintenanceMarginBps);
  return margin > maintenance ? margin - maintenance : margin;
}

export function computePriceDropPct(entryUsdc6: bigint, liqUsdc6: bigint, side: PerpSide): number {
  if (entryUsdc6 === 0n || liqUsdc6 === 0n) return 0;
  const entry = Number(entryUsdc6) / 1e6;
  const liq = Number(liqUsdc6) / 1e6;
  if (side === "long") return ((entry - liq) / entry) * 100;
  return ((liq - entry) / entry) * 100;
}

/** True when on-chain equity is below maintenance — position can be liquidated. */
export function isLiquidatableOnChain(
  equityUsdc6: bigint,
  size: bigint,
  markPriceUsdc6: bigint,
  maintenanceMarginBps: number,
): boolean {
  const maintenance = computeMaintenanceUsdc6(size, markPriceUsdc6, maintenanceMarginBps);
  return equityUsdc6 < maintenance;
}

/** Long: oracle mark at or below this → liquidatable. Short: at or above. */
export function isMarkPastLiquidation(
  side: PerpSide,
  markPriceUsdc6: bigint,
  liquidationPriceUsdc6: bigint,
): boolean {
  if (liquidationPriceUsdc6 === 0n || markPriceUsdc6 === 0n || side === "none") return false;
  if (side === "long") return markPriceUsdc6 <= liquidationPriceUsdc6;
  return markPriceUsdc6 >= liquidationPriceUsdc6;
}
