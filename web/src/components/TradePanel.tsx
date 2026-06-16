"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
  useReadContract,
} from "wagmi";
import { keccak256, maxUint256, parseEther, stringToBytes } from "viem";
import type { MarketSnapshot } from "@/lib/sosovalue";
import { useStockContractConfig } from "@/hooks/useStockContractConfig";
import { ARC_USDC_ADDRESS, erc20Abi, formatUsdc, parseUsdc } from "@/lib/usdc";
import { ARC_CHAIN_ID, getArcExplorerTxUrl } from "@/lib/arc-chain-utils";
import { useEnsureArcChain } from "@/hooks/useEnsureArcChain";
import { useUsdcBalance } from "@/hooks/useUsdcBalance";
import { invalidateTradeBalances } from "@/lib/invalidate-balances";
import { BALANCE_REFETCH_MS } from "@/lib/balance-refresh";
import { formatTradeError } from "@/lib/trade-errors";
import { recordClosedTradeClient } from "@/lib/record-closed-trade";

function formatSyncAge(timestamp: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

export function TradePanel({
  ticker,
  snapshot,
  onTradeComplete,
  onPricesSynced,
}: {
  ticker: string | null;
  snapshot: MarketSnapshot | null;
  onTradeComplete: () => void;
  onPricesSynced?: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    contractAddress,
    stockContractAbi,
    contractReady,
    isLoading: contractConfigLoading,
  } = useStockContractConfig();
  const { address, isConnected } = useAccount();
  const { onArc, ensureArc, isSwitching } = useEnsureArcChain();
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [confirmedTxHash, setConfirmedTxHash] = useState<`0x${string}` | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [trading, setTrading] = useState(false);
  const pendingSellRef = useRef<{
    ticker: string;
    shares: number;
    exitPrice: number | null;
  } | null>(null);

  const { data: oracleStatus } = useQuery({
    queryKey: ["oracle-status"],
    queryFn: async () => {
      const res = await fetch("/api/oracle/status");
      if (!res.ok) throw new Error("Failed to load oracle status");
      return res.json() as Promise<{
        enabled: boolean;
        running: boolean;
        lastSyncAt: number | null;
        lastTickerCount: number;
        lastError: string | null;
      }>;
    },
    refetchInterval: 15_000,
  });

  const { writeContractAsync, data: txHash, isPending, reset: resetWrite } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const { data: usdcBalanceRaw } = useUsdcBalance();

  const { data: holdingsRaw, refetch: refetchHoldings } = useReadContract({
    address: contractAddress ?? undefined,
    abi: stockContractAbi,
    functionName: "getHoldings",
    args: address && ticker ? [address, ticker] : undefined,
    query: {
      enabled: Boolean(address && contractAddress && ticker),
      staleTime: 0,
      refetchInterval: BALANCE_REFETCH_MS,
      refetchOnWindowFocus: true,
    },
  });

  const holdings = (holdingsRaw as bigint | undefined) ?? 0n;

  const { data: onChainPrice } = useReadContract({
    address: contractAddress ?? undefined,
    abi: stockContractAbi,
    functionName: "prices",
    args: ticker ? [keccak256(stringToBytes(ticker))] : undefined,
    query: {
      enabled: Boolean(ticker && contractReady),
      refetchInterval: 15_000,
    },
  });

  const { data: reserveBalanceRaw } = useReadContract({
    address: contractAddress ?? undefined,
    abi: stockContractAbi,
    functionName: "reserveBalance",
    query: { enabled: Boolean(contractReady) },
  });

  const { data: liabilitiesRaw } = useReadContract({
    address: contractAddress ?? undefined,
    abi: stockContractAbi,
    functionName: "totalLiabilities",
    query: { enabled: Boolean(contractReady) },
  });

  const { data: isSolvent } = useReadContract({
    address: contractAddress ?? undefined,
    abi: stockContractAbi,
    functionName: "isSolvent",
    query: { enabled: Boolean(contractReady) },
  });

  const displayPrice =
    snapshot?.mkt_price ??
    (onChainPrice && onChainPrice > 0n ? Number(formatUsdc(onChainPrice)) : null);
  const tradeReady = onChainPrice != null && onChainPrice > 0n;

  const reserveUsdc =
    reserveBalanceRaw != null ? Number(formatUsdc(reserveBalanceRaw)) : null;
  const liabilitiesUsdc =
    liabilitiesRaw != null ? Number(formatUsdc(liabilitiesRaw)) : null;

  const usdcBalance = usdcBalanceRaw != null ? Number(formatUsdc(usdcBalanceRaw)) : null;

  useEffect(() => {
    if (!isSuccess || !txHash) return;
    const id = setTimeout(() => {
      if (pendingSellRef.current && address) {
        const sell = pendingSellRef.current;
        recordClosedTradeClient({
          address,
          tradeType: "spot",
          ticker: sell.ticker,
          side: "sell",
          size: sell.shares,
          exitPrice: sell.exitPrice,
          txHash,
        });
        pendingSellRef.current = null;
      }
      invalidateTradeBalances(queryClient);
      setConfirmedTxHash(txHash);
      setStatus(null);
      setAmount("");
      setTrading(false);
      void refetchHoldings();
      onTradeComplete();
    }, 0);
    return () => clearTimeout(id);
  }, [isSuccess, txHash, queryClient, onTradeComplete, refetchHoldings, address]);

  const handleSyncPrices = async () => {
    setSyncing(true);
    setStatus(null);
    setStatusIsError(false);
    try {
      const res = await fetch("/api/oracle/nudge", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setStatus(`Synced ${data.synced ?? 0} prices on-chain`);
      setStatusIsError(false);
      onPricesSynced?.();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Sync failed");
      setStatusIsError(true);
    } finally {
      setSyncing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractReady || !address || !publicClient || !contractAddress) {
      setStatus("Deploy StockVault and set NEXT_PUBLIC_STOCK_VAULT_ADDRESS");
      return;
    }
    if (!amount || Number(amount) <= 0) return;
    if (!tradeReady) {
      setStatus("Waiting for automatic price sync to vault…");
      return;
    }
    setStatus(null);
    setStatusIsError(false);
    setConfirmedTxHash(null);
    resetWrite();
    setTrading(true);

    try {
      if (!onArc) {
        setStatus("Switching to Arc Testnet…");
        await ensureArc();
      }

      if (mode === "buy") {
        const usdcAmount = parseUsdc(amount);

        if (usdcBalanceRaw != null && usdcBalanceRaw < usdcAmount) {
          throw new Error(
            `Insufficient USDC — you have $${Number(formatUsdc(usdcBalanceRaw)).toFixed(2)} but need $${amount}`,
          );
        }

        const allowance = await publicClient!.readContract({
          address: ARC_USDC_ADDRESS,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, contractAddress],
        });

        if (allowance < usdcAmount) {
          setStatus("Step 1/2: Approve USDC in your wallet…");
          const approveHash = await writeContractAsync({
            chainId: ARC_CHAIN_ID,
            address: ARC_USDC_ADDRESS,
            abi: erc20Abi,
            functionName: "approve",
            args: [contractAddress, maxUint256],
          });
          await publicClient!.waitForTransactionReceipt({ hash: approveHash });
        }

        await publicClient!.simulateContract({
          address: contractAddress,
          abi: stockContractAbi,
          functionName: "buy",
          args: [ticker!, usdcAmount, 0n],
          account: address,
        });

        setStatus("Step 2/2: Confirm buy in your wallet…");
        await writeContractAsync({
          chainId: ARC_CHAIN_ID,
          address: contractAddress,
          abi: stockContractAbi,
          functionName: "buy",
          args: [ticker!, usdcAmount, 0n],
        });
      } else {
        const shares = parseEther(amount);

        if (shares > holdings) {
          const held = Number(holdings) / 1e18;
          throw new Error(
            `You do not hold enough shares to sell. You have ${held.toFixed(4)} shares.`,
          );
        }

        await publicClient!.simulateContract({
          address: contractAddress,
          abi: stockContractAbi,
          functionName: "sell",
          args: [ticker!, shares],
          account: address,
        });

        pendingSellRef.current = {
          ticker: ticker!,
          shares: Number(shares) / 1e18,
          exitPrice: displayPrice,
        };

        setStatus("Confirm sell in your wallet…");
        await writeContractAsync({
          chainId: ARC_CHAIN_ID,
          address: contractAddress,
          abi: stockContractAbi,
          functionName: "sell",
          args: [ticker!, shares],
        });
      }
    } catch (err) {
      pendingSellRef.current = null;
      setConfirmedTxHash(null);
      resetWrite();
      setStatus(formatTradeError(err));
      setStatusIsError(true);
      setTrading(false);
    }
  };

  const holdingsFormatted = Number(holdings) / 1e18;

  if (!ticker) {
    return (
      <div className="glass-card flex flex-col items-center justify-center rounded-2xl p-8 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04]">
          <svg className="h-6 w-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 11l5-5m0 0l5 5m-5-5v12" />
          </svg>
        </div>
        <p className="text-sm text-zinc-500">Select a stock to trade</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-400/80">
            Arc Testnet · USDC Vault
          </p>
          <h2 className="mt-0.5 text-2xl font-bold tracking-tight text-zinc-100">{ticker}</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Buy & sell synthetic shares · USDC-backed on Arc
          </p>
          {contractAddress && (
            <p className="mt-1 font-mono text-[10px] text-zinc-600">
              {contractAddress.slice(0, 6)}…{contractAddress.slice(-4)}
            </p>
          )}
        </div>
        {displayPrice != null && (
          <div className="text-right">
            <p className="font-mono text-xl font-semibold text-zinc-100">${displayPrice.toFixed(2)}</p>
            <p className="text-[10px] text-zinc-600">per share</p>
          </div>
        )}
      </div>

      {reserveUsdc != null && liabilitiesUsdc != null && (
        <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">
            Vault reserve
          </p>
          <p className="mt-1 font-mono text-sm text-zinc-200">
            ${reserveUsdc.toFixed(2)} USDC
            {liabilitiesUsdc > 0 && (
              <span className="text-zinc-500">
                {" "}
                · liabilities ${liabilitiesUsdc.toFixed(2)}
              </span>
            )}
          </p>
          {isSolvent === false && (
            <p className="mt-1 text-xs text-amber-400">Undercollateralized — buys paused until reserve topped up</p>
          )}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-white/[0.02] p-1">
        {(["buy", "sell"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-lg py-2.5 text-sm font-semibold capitalize transition-all ${
              mode === m
                ? m === "buy"
                  ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                  : "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            {mode === "buy" ? "Amount (USDC)" : "Shares to sell"}
          </label>
          <input
            type="number"
            step="any"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={mode === "buy" ? "0.00" : "0.0"}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 font-mono text-lg text-zinc-100 outline-none transition-all placeholder:text-zinc-700 focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/10"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl bg-white/[0.02] px-4 py-3">
          <span className="text-xs text-zinc-500">Your holdings</span>
          <span className="font-mono text-sm font-medium text-zinc-300">
            {holdingsFormatted.toFixed(4)} shares
          </span>
        </div>

        {!isConnected && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">Connect wallet to trade</p>
        )}
        {isConnected && !onArc && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">Switch to Arc Testnet to trade</p>
        )}
        {isConnected && contractReady && !tradeReady && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            {oracleStatus?.running
              ? "Syncing live prices to vault…"
              : "Waiting for automatic price sync — trading opens once on-chain price is set"}
          </p>
        )}
        {mode === "buy" && usdcBalance != null && (
          <p className="text-xs text-zinc-500">
            Wallet USDC on Arc: ${usdcBalance.toFixed(2)}
          </p>
        )}
        {mode === "buy" && isSolvent === false && tradeReady && (
          <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            Vault is undercollateralized after a recent price update. Buys are paused until the reserve is topped up.
          </p>
        )}

        <button
          type="submit"
          disabled={
            !isConnected ||
            !contractReady ||
            contractConfigLoading ||
            !tradeReady ||
            isPending ||
            isConfirming ||
            trading ||
            isSwitching ||
            !amount ||
            (mode === "buy" && isSolvent === false)
          }
          className={`w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all disabled:opacity-40 disabled:shadow-none ${
            mode === "buy"
              ? "bg-emerald-500 shadow-lg shadow-emerald-500/25 hover:bg-emerald-400 hover:shadow-emerald-500/35"
              : "bg-rose-500 shadow-lg shadow-rose-500/25 hover:bg-rose-400 hover:shadow-rose-500/35"
          }`}
        >
          {isPending || isConfirming || trading
            ? "Confirming…"
            : `${mode === "buy" ? "Buy" : "Sell"} ${ticker}`}
        </button>
      </form>

      {(confirmedTxHash || status) && (
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            confirmedTxHash || (status && !statusIsError)
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-rose-500/10 text-rose-400"
          }`}
        >
          {confirmedTxHash ? (
            <span>
              Trade confirmed on Arc.{" "}
              <a
                href={getArcExplorerTxUrl(confirmedTxHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
              >
                View on ArcScan
              </a>
            </span>
          ) : (
            status
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-white/[0.02] px-3 py-2.5">
        <p className="text-[10px] text-zinc-600">
          {oracleStatus?.running
            ? "Syncing prices to vault…"
            : oracleStatus?.lastSyncAt
              ? `Vault prices updated ${formatSyncAge(oracleStatus.lastSyncAt)}`
              : "Auto price sync starting…"}
        </p>
        <button
          type="button"
          onClick={handleSyncPrices}
          disabled={syncing || oracleStatus?.running}
          className="text-[10px] font-medium text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>
    </div>
  );
}
