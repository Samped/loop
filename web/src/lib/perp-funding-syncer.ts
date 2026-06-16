import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "@/lib/arc-chain";
import { getOraclePrivateKey } from "@/lib/config-secrets";
import { perpEngineAbi } from "@/lib/contracts/perp-engine";
import { PERP_MARKET_TICKERS } from "@/lib/perp-markets";

const ARC_RPC_URL = arcTestnet.rpcUrls.default.http[0];
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // every 30 min
const STARTUP_DELAY_MS = 5_000;
const MEMPOOL_WAIT_MS = 90_000;

type FundingStatus = {
  enabled: boolean;
  lastRunAt: number | null;
  lastAppliedCount: number;
  lastError: string | null;
};

const state: FundingStatus = {
  enabled: false,
  lastRunAt: null,
  lastAppliedCount: 0,
  lastError: null,
};

let started = false;

function getPerpAddress(): `0x${string}` | null {
  const addr = process.env.PERP_ENGINE_ADDRESS ?? process.env.NEXT_PUBLIC_PERP_ENGINE_ADDRESS;
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return null;
  return addr as `0x${string}`;
}

export function getPerpFundingStatus(): FundingStatus {
  return { ...state };
}

async function waitForTxSlot(publicClient: ReturnType<typeof createPublicClient>, address: `0x${string}`) {
  const deadline = Date.now() + MEMPOOL_WAIT_MS;
  while (Date.now() < deadline) {
    const [latest, pending] = await Promise.all([
      publicClient.getTransactionCount({ address, blockTag: "latest" }),
      publicClient.getTransactionCount({ address, blockTag: "pending" }),
    ]);
    if (pending === latest) return;
    await new Promise((r) => setTimeout(r, 3000));
  }
}

async function runFunding() {
  const engine = getPerpAddress();
  const key = getOraclePrivateKey();
  if (!engine || !key) {
    state.enabled = false;
    state.lastError = "PERP_ENGINE_ADDRESS or PRIVATE_KEY not configured";
    return;
  }

  state.enabled = true;
  state.lastError = null;

  const account = privateKeyToAccount(key);
  const transport = http(ARC_RPC_URL);
  const publicClient = createPublicClient({ chain: arcTestnet, transport });
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport });

  let applied = 0;
  for (const ticker of PERP_MARKET_TICKERS) {
    try {
      await waitForTxSlot(publicClient, account.address);
      const nonce = await publicClient.getTransactionCount({
        address: account.address,
        blockTag: "pending",
      });
      const hash = await walletClient.writeContract({
        address: engine,
        abi: perpEngineAbi,
        functionName: "applyFunding",
        args: [ticker],
        nonce,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      applied += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "applyFunding failed";
      // Contract no-ops if interval not elapsed — not a hard failure.
      if (!msg.toLowerCase().includes("revert") && !msg.includes("execution reverted")) {
        state.lastError = msg;
      }
    }
  }

  state.lastRunAt = Date.now();
  state.lastAppliedCount = applied;
}

export function startPerpFundingSyncer() {
  if (started) return;
  started = true;

  if (!getPerpAddress()) {
    state.enabled = false;
    return;
  }

  state.enabled = true;
  setTimeout(() => void runFunding(), STARTUP_DELAY_MS);
  setInterval(() => void runFunding(), CHECK_INTERVAL_MS);
}
