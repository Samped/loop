import { randomBytes } from "crypto";
import { createPublicClient, createWalletClient, http, keccak256, stringToBytes, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "@/lib/arc-chain";
import { getOraclePrivateKey } from "@/lib/config-secrets";
import { perpEngineAbi } from "@/lib/contracts/perp-engine";
import { advancePerpMark } from "@/lib/perp-mark-engine";
import { isAnyTraderLiquidatableAtMark } from "@/lib/perp-liquidator";
import { PERP_MARKET_TICKERS, filterPerpMarketTickers } from "@/lib/perp-markets";

const BATCH_SIZE = 50;
const ARC_RPC_URL = arcTestnet.rpcUrls.default.http[0];
const MEMPOOL_WAIT_MS = 90_000;
/** Must match PerpEngine.maxPriceDeviationBps default (15%). */
const MAX_MARK_DEVIATION_BPS = 1500;
const MAX_CATCHUP_ROUNDS = 8;
const CATCHUP_TOLERANCE_BPS = 50n; // 0.5% — keep oracle close to settlement mark
/** PerpEngine MAX_ORACLE_STALENESS is 5 minutes — heartbeat before expiry. */
const ORACLE_STALE_SEC = 280;

function markDriftBps(current: bigint, target: bigint): bigint {
  if (target === 0n) return 0n;
  const diff = current > target ? current - target : target - current;
  return (diff * 10_000n) / target;
}

function clampMarkToDeviation(current: bigint, target: bigint): bigint {
  if (current === 0n) return target;
  const u = randomBytes(2).readUInt16BE(0) / 65535;
  const stepFraction = 0.35 + u * 0.6;
  const maxDelta = (current * BigInt(MAX_MARK_DEVIATION_BPS)) / 10_000n;
  const scaledMax = (maxDelta * BigInt(Math.round(stepFraction * 1000))) / 1000n;
  if (target > current) {
    const cap = current + scaledMax;
    return target > cap ? cap : target;
  }
  const floor = current > scaledMax ? current - scaledMax : 0n;
  return target < floor ? floor : target;
}

function getPerpAddress(): `0x${string}` | null {
  const addr = process.env.PERP_ENGINE_ADDRESS ?? process.env.NEXT_PUBLIC_PERP_ENGINE_ADDRESS;
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return null;
  return addr as `0x${string}`;
}

function toUsdc6(price: number): bigint {
  return BigInt(Math.round(price * 1e6));
}

async function waitForTxSlot(publicClient: ReturnType<typeof createPublicClient>, address: Address) {
  const deadline = Date.now() + MEMPOOL_WAIT_MS;
  while (Date.now() < deadline) {
    const [latest, pending] = await Promise.all([
      publicClient.getTransactionCount({ address, blockTag: "latest" }),
      publicClient.getTransactionCount({ address, blockTag: "pending" }),
    ]);
    if (pending === latest) return;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Oracle wallet still has pending transactions");
}

export type PerpOracleSyncResult = {
  synced: number;
  error?: string;
};

export async function syncPerpMarkPrices(tickers?: string[]): Promise<PerpOracleSyncResult> {
  const engine = getPerpAddress();
  const key = getOraclePrivateKey();
  if (!engine) return { synced: 0, error: "PERP_ENGINE_ADDRESS not configured" };
  if (!key) return { synced: 0, error: "ORACLE_PRIVATE_KEY not configured" };

  const targets = tickers?.length ? filterPerpMarketTickers(tickers) : [...PERP_MARKET_TICKERS];
  if (!targets.length) return { synced: 0, error: "No valid perp tickers" };
  const account = privateKeyToAccount(key);
  const transport = http(ARC_RPC_URL);
  const publicClient = createPublicClient({ chain: arcTestnet, transport });
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport });

  const targetByTicker = new Map<string, bigint>();
  for (const ticker of targets) {
    const snap = await advancePerpMark(ticker);
    const oraclePrice = snap?.price ?? snap?.twapPrice;
    if (oraclePrice && oraclePrice > 0) {
      targetByTicker.set(ticker.toUpperCase(), toUsdc6(oraclePrice));
    }
  }

  if (!targetByTicker.size) return { synced: 0, error: "No prices available" };

  let synced = 0;
  let lastError: string | undefined;

  const block = await publicClient.getBlock();
  const blockTime = Number(block.timestamp);

  for (let round = 0; round < MAX_CATCHUP_ROUNDS; round++) {
    const batch: { ticker: string; mark: bigint; target: bigint }[] = [];

    for (const [ticker, target] of targetByTicker) {
      const tickerHash = keccak256(stringToBytes(ticker));
      let mark = target;
      try {
        const market = await publicClient.readContract({
          address: engine,
          abi: perpEngineAbi,
          functionName: "markets",
          args: [tickerHash],
        });
        const current = BigInt(market[1]);
        const lastUpdate = Number(market[3]);
        const stale = current > 0n && blockTime > lastUpdate + ORACLE_STALE_SEC;
        const liquidatable = await isAnyTraderLiquidatableAtMark(ticker, target);
        const driftOk = markDriftBps(current, target) <= CATCHUP_TOLERANCE_BPS;

        if (!liquidatable && !stale && driftOk) continue;

        if (stale && current > 0n) {
          // Heartbeat: refresh lastMarkUpdate without moving price (market closed / flat index).
          mark = current;
        } else {
          mark = clampMarkToDeviation(current, target);
          if (mark === current) continue;
        }
      } catch {
        // use target on first set
      }
      batch.push({ ticker, mark, target });
    }

    if (!batch.length) break;

    for (let i = 0; i < batch.length; i += BATCH_SIZE) {
      const slice = batch.slice(i, i + BATCH_SIZE);
      const tickersArg = slice.map((b) => b.ticker);
      const marks = slice.map((b) => b.mark);
      const indices = marks;

      try {
        await waitForTxSlot(publicClient, account.address);
        const nonce = await publicClient.getTransactionCount({
          address: account.address,
          blockTag: "pending",
        });
        const hash = await walletClient.writeContract({
          address: engine,
          abi: perpEngineAbi,
          functionName: "setMarkPrices",
          args: [tickersArg, marks, indices],
          nonce,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        synced += slice.length;
      } catch (err) {
        const message = err instanceof Error ? err.message : "setMarkPrices failed";
        lastError = message;
        if (synced === 0) return { synced: 0, error: message };
        return { synced, error: message };
      }
    }
  }

  if (synced === 0 && lastError) return { synced: 0, error: lastError };
  return { synced: synced || targetByTicker.size };
}

export async function syncPerpMarkPricesAndLiquidate(tickers?: string[]): Promise<PerpOracleSyncResult> {
  const result = await syncPerpMarkPrices(tickers);
  const { liquidateUnderwaterPositions } = await import("@/lib/perp-liquidator");
  await liquidateUnderwaterPositions(tickers).catch(() => {});
  return result;
}
