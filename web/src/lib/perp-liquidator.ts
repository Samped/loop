import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToBytes,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "@/lib/arc-chain";
import { getOraclePrivateKey } from "@/lib/config";
import { perpEngineAbi, perpEngineEventsAbi } from "@/lib/contracts/perp-engine";
import { computeUnrealizedPnlUsdc6, isLiquidatableOnChain, parsePerpSide } from "@/lib/perp";
import { PERP_MARKET_TICKERS } from "@/lib/perp-markets";
import {
  getRegisteredPerpTraders,
  registerPerpTrader,
  unregisterPerpTrader,
} from "@/lib/perp-trader-registry";

const ARC_RPC_URL = arcTestnet.rpcUrls.default.http[0];
const MEMPOOL_WAIT_MS = 90_000;
const EVENT_LOOKBACK_BLOCKS = 50_000n;
const EVENT_CHUNK_BLOCKS = 9_999n;
const EVENT_CACHE_MS = 120_000;

type TraderCache = { traders: Set<string>; fetchedAt: number };
const eventTradersByTicker = new Map<string, TraderCache>();

function getPerpAddress(): `0x${string}` | null {
  const addr = process.env.PERP_ENGINE_ADDRESS ?? process.env.NEXT_PUBLIC_PERP_ENGINE_ADDRESS;
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return null;
  return addr as `0x${string}`;
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
  throw new Error("Liquidator wallet still has pending transactions");
}

async function fetchEventsInChunks<T>(
  publicClient: ReturnType<typeof createPublicClient>,
  fetchChunk: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>,
): Promise<T[]> {
  const latest = await publicClient.getBlockNumber();
  const start = latest > EVENT_LOOKBACK_BLOCKS ? latest - EVENT_LOOKBACK_BLOCKS : 0n;
  const all: T[] = [];

  for (let from = start; from <= latest; from += EVENT_CHUNK_BLOCKS + 1n) {
    const to = from + EVENT_CHUNK_BLOCKS > latest ? latest : from + EVENT_CHUNK_BLOCKS;
    const chunk = await fetchChunk(from, to);
    all.push(...chunk);
  }

  return all;
}

async function discoverTradersFromEvents(
  publicClient: ReturnType<typeof createPublicClient>,
  engine: Address,
  ticker: string,
): Promise<Set<string>> {
  const upper = ticker.toUpperCase();
  const cached = eventTradersByTicker.get(upper);
  if (cached && Date.now() - cached.fetchedAt < EVENT_CACHE_MS) {
    return cached.traders;
  }

  const tickerId = keccak256(stringToBytes(upper));
  const traders = new Set<string>();

  try {
    const opened = await fetchEventsInChunks(publicClient, (fromBlock, toBlock) =>
      publicClient.getContractEvents({
        address: engine,
        abi: perpEngineEventsAbi,
        eventName: "PositionOpened",
        args: { ticker: tickerId },
        fromBlock,
        toBlock,
      }),
    );
    for (const log of opened) {
      if (log.args.user) traders.add(log.args.user.toLowerCase());
    }

    const closed = await fetchEventsInChunks(publicClient, (fromBlock, toBlock) =>
      publicClient.getContractEvents({
        address: engine,
        abi: perpEngineEventsAbi,
        eventName: "PositionClosed",
        args: { ticker: tickerId },
        fromBlock,
        toBlock,
      }),
    );
    for (const log of closed) {
      if (log.args.user) traders.delete(log.args.user.toLowerCase());
    }

    const liquidated = await fetchEventsInChunks(publicClient, (fromBlock, toBlock) =>
      publicClient.getContractEvents({
        address: engine,
        abi: perpEngineEventsAbi,
        eventName: "Liquidated",
        args: { ticker: tickerId },
        fromBlock,
        toBlock,
      }),
    );
    for (const log of liquidated) {
      if (log.args.user) traders.delete(log.args.user.toLowerCase());
    }
  } catch {
    if (cached) return cached.traders;
  }

  eventTradersByTicker.set(upper, { traders, fetchedAt: Date.now() });
  return traders;
}

async function collectTraders(
  publicClient: ReturnType<typeof createPublicClient>,
  engine: Address,
  ticker: string,
): Promise<Address[]> {
  const upper = ticker.toUpperCase();
  const merged = new Set<string>();

  for (const addr of getRegisteredPerpTraders(upper)) {
    merged.add(addr.toLowerCase());
  }

  const fromEvents = await discoverTradersFromEvents(publicClient, engine, upper);
  for (const addr of fromEvents) merged.add(addr);

  return [...merged] as Address[];
}

export type PerpLiquidationResult = {
  checked: number;
  liquidated: number;
  error?: string;
};

/** True if any known trader would be liquidatable at the given oracle mark. */
export async function isAnyTraderLiquidatableAtMark(
  ticker: string,
  markPriceUsdc6: bigint,
): Promise<boolean> {
  const engine = getPerpAddress();
  if (!engine || markPriceUsdc6 === 0n) return false;

  const transport = http(ARC_RPC_URL);
  const publicClient = createPublicClient({ chain: arcTestnet, transport });
  const tickerHash = keccak256(stringToBytes(ticker.toUpperCase()));

  const market = await publicClient.readContract({
    address: engine,
    abi: perpEngineAbi,
    functionName: "markets",
    args: [tickerHash],
  });
  const maintenanceBps = Number(market[5]);

  const traders = await collectTraders(publicClient, engine, ticker);
  for (const user of traders) {
    const pos = await publicClient.readContract({
      address: engine,
      abi: perpEngineAbi,
      functionName: "getPosition",
      args: [user, ticker.toUpperCase()],
    });
    if (parsePerpSide(Number(pos[0])) === "none") continue;
    const side = parsePerpSide(Number(pos[0]))!;
    const pnlAtMark = computeUnrealizedPnlUsdc6(side, pos[1], pos[3], markPriceUsdc6);
    const equityAtMark = pos[2] + pnlAtMark;
    if (isLiquidatableOnChain(equityAtMark, pos[1], markPriceUsdc6, maintenanceBps)) return true;
  }
  return false;
}

/** Permissionless liquidations for underwater positions (uses on-chain oracle mark). */
export async function liquidateUnderwaterPositions(tickers?: string[]): Promise<PerpLiquidationResult> {
  const engine = getPerpAddress();
  const key = getOraclePrivateKey();
  if (!engine) return { checked: 0, liquidated: 0, error: "PERP_ENGINE_ADDRESS not configured" };
  if (!key) return { checked: 0, liquidated: 0, error: "ORACLE_PRIVATE_KEY not configured" };

  const targets = tickers?.length ? tickers : [...PERP_MARKET_TICKERS];
  const account = privateKeyToAccount(key);
  const transport = http(ARC_RPC_URL);
  const publicClient = createPublicClient({ chain: arcTestnet, transport });
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport });

  let checked = 0;
  let liquidated = 0;
  let lastError: string | undefined;

  for (const ticker of targets) {
    const upper = ticker.toUpperCase();
    const tickerHash = keccak256(stringToBytes(upper));
    const market = await publicClient.readContract({
      address: engine,
      abi: perpEngineAbi,
      functionName: "markets",
      args: [tickerHash],
    });
    const markPrice = market[1];
    const maintenanceBps = Number(market[5]);
    if (markPrice === 0n) continue;

    const traders = await collectTraders(publicClient, engine, upper);

    for (const user of traders) {
      const pos = await publicClient.readContract({
        address: engine,
        abi: perpEngineAbi,
        functionName: "getPosition",
        args: [user, upper],
      });

      const side = parsePerpSide(Number(pos[0]));
      if (side === "none") {
        unregisterPerpTrader(upper, user);
        continue;
      }

      registerPerpTrader(upper, user);
      checked += 1;
      const size = pos[1];
      const equity = pos[5];

      if (!isLiquidatableOnChain(equity, size, markPrice, maintenanceBps)) continue;

      try {
        await waitForTxSlot(publicClient, account.address);
        const nonce = await publicClient.getTransactionCount({
          address: account.address,
          blockTag: "pending",
        });
        const hash = await walletClient.writeContract({
          address: engine,
          abi: perpEngineAbi,
          functionName: "liquidate",
          args: [user, upper],
          nonce,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        liquidated += 1;
        unregisterPerpTrader(upper, user);
        eventTradersByTicker.get(upper)?.traders.delete(user.toLowerCase());
      } catch (err) {
        lastError = err instanceof Error ? err.message : "liquidate failed";
      }
    }
  }

  return { checked, liquidated, error: lastError };
}
