"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { keccak256, maxUint256, stringToBytes, type Address, type PublicClient } from "viem";
import type { MarketSnapshot } from "@/lib/sosovalue";
import { useLivePerpMark } from "@/hooks/useLivePerpMark";
import { usePerpContractConfig } from "@/hooks/usePerpContractConfig";
import { ARC_CHAIN_ID } from "@/lib/arc-chain-utils";
import { useEnsureArcChain } from "@/hooks/useEnsureArcChain";
import { useUsdcBalance } from "@/hooks/useUsdcBalance";
import { ARC_USDC_ADDRESS, erc20Abi, formatUsdc, parseUsdc } from "@/lib/usdc";
import {
  computeFullMarginLossPriceUsdc6,
  computeLiquidationPrice,
  computeLossAtLiquidationUsdc6,
  computeMaintenanceUsdc6,
  computePriceDropPct,
  computeUnrealizedPnlUsdc6,
  effectiveLeverage,
  formatLiquidationPrice,
  formatPerpPnl,
  isLiquidatableOnChain,
  isMarkPastLiquidation,
  openSizeFromMargin,
  parsePerpSide,
} from "@/lib/perp";
import { formatTradeError } from "@/lib/trade-errors";
import { refreshAllBalances } from "@/lib/balance-refresh";

const LEVERAGE_OPTIONS = [2, 3, 5, 10, 15, 20];
const CONTRACT_POLL_MS = 1_000;
const WALLET_TX_WAIT_MS = 60_000;

async function waitForWalletTxSlot(publicClient: PublicClient, address: Address) {
  const deadline = Date.now() + WALLET_TX_WAIT_MS;
  while (Date.now() < deadline) {
    const [latest, pending] = await Promise.all([
      publicClient.getTransactionCount({ address, blockTag: "latest" }),
      publicClient.getTransactionCount({ address, blockTag: "pending" }),
    ]);
    if (pending === latest) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Wallet still has pending transactions — wait and try again.");
}

export function PerpPanel({
  ticker,
  snapshot,
  onTradeComplete,
}: {
  ticker: string;
  snapshot: MarketSnapshot | null;
  onTradeComplete?: () => void;
}) {
  const queryClient = useQueryClient();
  const { contractAddress, perpContractAbi, contractReady } = usePerpContractConfig();
  const { address, isConnected } = useAccount();
  const { onArc, ensureArc, isSwitching } = useEnsureArcChain();
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID });

  const [side, setSide] = useState<"long" | "short">("long");
  const [margin, setMargin] = useState("");
  const [leverage, setLeverage] = useState(5);
  const [status, setStatus] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [trading, setTrading] = useState(false);
  const [liquidationAlert, setLiquidationAlert] = useState<{
    ticker: string;
    side: "long" | "short";
  } | null>(null);

  const userClosingRef = useRef(false);
  const hadPositionRef = useRef<boolean | null>(null);
  const lastPositionRef = useRef<{ side: "long" | "short" } | null>(null);

  const tickerHash = useMemo(
    () => (ticker ? keccak256(stringToBytes(ticker)) : undefined),
    [ticker],
  );

  const { data: market, refetch: refetchMarket } = useReadContract({
    address: contractAddress ?? undefined,
    abi: perpContractAbi,
    functionName: "markets",
    args: tickerHash ? [tickerHash] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(contractAddress && tickerHash), refetchInterval: CONTRACT_POLL_MS },
  });

  const { data: positionRaw, refetch: refetchPosition } = useReadContract({
    address: contractAddress ?? undefined,
    abi: perpContractAbi,
    functionName: "getPosition",
    args: address && ticker ? [address, ticker] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(contractAddress && address && ticker), refetchInterval: CONTRACT_POLL_MS },
  });

  const { data: paused } = useReadContract({
    address: contractAddress ?? undefined,
    abi: perpContractAbi,
    functionName: "paused",
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(contractAddress) },
  });

  const { data: usdcBalanceRaw, refetch: refetchUsdcBalance } = useUsdcBalance();
  const { data: poolBalanceRaw } = useReadContract({
    address: contractAddress ?? undefined,
    abi: perpContractAbi,
    functionName: "poolBalance",
    chainId: ARC_CHAIN_ID,
    query: {
      enabled: Boolean(contractAddress),
      refetchInterval: CONTRACT_POLL_MS,
    },
  });
  const { data: insuranceFundRaw } = useReadContract({
    address: contractAddress ?? undefined,
    abi: perpContractAbi,
    functionName: "insuranceFund",
    chainId: ARC_CHAIN_ID,
    query: {
      enabled: Boolean(contractAddress),
      refetchInterval: CONTRACT_POLL_MS,
    },
  });
  const { writeContractAsync, isPending, reset: resetWrite } = useWriteContract();

  const markPrice = market?.[1] ?? 0n;
  const maxLeverage = market?.[4] ? Number(market[4]) : 20;
  const maintenanceMarginBps = market?.[5] ? Number(market[5]) : 500;
  const snapshotPrice = snapshot?.mkt_price ?? 0;
  const onChainPrice = Number(markPrice) / 1e6;
  const { livePrice, mode: markMode, sourceCount } = useLivePerpMark(
    ticker,
    snapshotPrice > 0 ? snapshotPrice : onChainPrice > 0 ? onChainPrice : undefined,
  );
  const displayPrice =
    livePrice ?? (snapshotPrice > 0 ? snapshotPrice : onChainPrice > 0 ? onChainPrice : 0);
  const markModeLabel =
    markMode === "closed"
      ? "index + perp mark · after hours"
      : markMode === "live"
        ? sourceCount > 1
          ? `index + perp mark · ${sourceCount} feeds`
          : "index + perp mark"
        : markMode === "gbm"
          ? "stochastic (demo)"
          : "mark";
  const markUsdc6ForPnl =
    livePrice != null && livePrice > 0
      ? BigInt(Math.round(livePrice * 1e6))
      : markPrice > 0n
        ? markPrice
        : snapshotPrice > 0
          ? BigInt(Math.round(snapshotPrice * 1e6))
          : 0n;
  const priceUsdc6 =
    markPrice > 0n
      ? markPrice
      : snapshotPrice > 0
        ? BigInt(Math.round(snapshotPrice * 1e6))
        : 0n;
  const settlementPriceUsdc6 = markPrice > 0n ? markPrice : priceUsdc6;
  const tradePriceUsdc6 = markUsdc6ForPnl > 0n ? markUsdc6ForPnl : settlementPriceUsdc6;

  const marginParsed = margin ? parseUsdc(margin) : 0n;
  const previewSize =
    settlementPriceUsdc6 > 0n
      ? openSizeFromMargin(marginParsed, leverage, settlementPriceUsdc6, maxLeverage)
      : 0n;

  const position = useMemo(
    () =>
      positionRaw
        ? {
            side: parsePerpSide(Number(positionRaw[0])),
            size: positionRaw[1],
            margin: positionRaw[2],
            entryPrice: positionRaw[3],
            unrealizedPnl: positionRaw[4],
            equity: positionRaw[5],
            liquidationPrice: positionRaw[6],
          }
        : null,
    [positionRaw],
  );

  const hasPosition = position && position.side !== "none";

  const livePnlUsdc6 =
    hasPosition && position && markUsdc6ForPnl > 0n
      ? computeUnrealizedPnlUsdc6(position.side, position.size, position.entryPrice, markUsdc6ForPnl)
      : 0n;

  const liveEquityUsdc6 = hasPosition && position ? position.margin + livePnlUsdc6 : 0n;

  const livePnlUsd = Number(livePnlUsdc6) / 1e6;
  const liveEquityUsd = Number(liveEquityUsdc6) / 1e6;
  const walletUsdcUsd = usdcBalanceRaw != null ? Number(formatUsdc(usdcBalanceRaw)) : null;
  const lockedMarginUsd = hasPosition && position ? Number(position.margin) / 1e6 : 0;
  const marginUsd = lockedMarginUsd;
  const poolUsdcUsd = poolBalanceRaw != null ? Number(formatUsdc(poolBalanceRaw)) : null;
  const insuranceUsd = insuranceFundRaw != null ? Number(formatUsdc(insuranceFundRaw)) : null;

  useEffect(() => {
    if (positionRaw === undefined) return;

    const open = Boolean(hasPosition);
    if (hadPositionRef.current === null) {
      hadPositionRef.current = open;
      if (open && position && (position.side === "long" || position.side === "short")) {
        lastPositionRef.current = { side: position.side };
      }
      return;
    }

    if (hadPositionRef.current && !open) {
      if (!userClosingRef.current) {
        setLiquidationAlert({
          ticker,
          side: lastPositionRef.current?.side ?? "long",
        });
      }
      userClosingRef.current = false;
    }

    hadPositionRef.current = open;
    if (open && position && (position.side === "long" || position.side === "short")) {
      lastPositionRef.current = { side: position.side };
    }
  }, [positionRaw, hasPosition, position, ticker]);

  const displayLiquidationPrice = useMemo(() => {
    if (hasPosition && position) {
      if (position.liquidationPrice > 0n) return position.liquidationPrice;
      return computeLiquidationPrice(
        position.side,
        position.size,
        position.margin,
        position.entryPrice,
        maintenanceMarginBps,
      );
    }
    const entryForPreview = tradePriceUsdc6 > 0n ? tradePriceUsdc6 : markPrice > 0n ? markPrice : priceUsdc6;
    if (marginParsed > 0n && previewSize > 0n && entryForPreview > 0n) {
      return computeLiquidationPrice(
        side,
        previewSize,
        marginParsed,
        entryForPreview,
        maintenanceMarginBps,
      );
    }
    return null;
  }, [
    hasPosition,
    position,
    marginParsed,
    previewSize,
    priceUsdc6,
    tradePriceUsdc6,
    markPrice,
    side,
    maintenanceMarginBps,
  ]);

  const onChainEquityUsdc6 = hasPosition && position ? position.equity : 0n;
  const onChainEquityUsd = Number(onChainEquityUsdc6) / 1e6;

  const liveLiquidatable =
    hasPosition &&
    position &&
    markUsdc6ForPnl > 0n &&
    isLiquidatableOnChain(liveEquityUsdc6, position.size, markUsdc6ForPnl, maintenanceMarginBps);

  const livePastLiq =
    hasPosition &&
    position &&
    displayLiquidationPrice != null &&
    displayLiquidationPrice > 0n &&
    livePrice != null &&
    livePrice > 0 &&
    isMarkPastLiquidation(
      position.side,
      BigInt(Math.round(livePrice * 1e6)),
      displayLiquidationPrice,
    );

  useEffect(() => {
    if (!address || !ticker) return;
    if (!hasPosition) {
      fetch("/api/perp/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, ticker, open: false }),
      }).catch(() => {});
      return;
    }
    fetch("/api/perp/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, ticker, open: true }),
    }).catch(() => {});
  }, [address, ticker, hasPosition]);

  useEffect(() => {
    if (!address || !ticker || !hasPosition) return;
    if (!liveLiquidatable && !livePastLiq) return;

    const nudge = () => {
      fetch("/api/perp/liquidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: [ticker] }),
      }).catch(() => {});
    };

    nudge();
    const id = setInterval(nudge, 4_000);
    return () => clearInterval(id);
  }, [address, ticker, hasPosition, liveLiquidatable, livePastLiq]);

  const liqContext = useMemo(() => {
    if (!displayLiquidationPrice || displayLiquidationPrice === 0n) return null;

    const sideForPreview = hasPosition && position ? position.side : side;
    const sizeForCalc = hasPosition && position ? position.size : previewSize;
    const marginForCalc = hasPosition && position ? position.margin : marginParsed;
    const entryForCalc =
      hasPosition && position
        ? position.entryPrice
        : tradePriceUsdc6 > 0n
          ? tradePriceUsdc6
          : priceUsdc6;

    if (sizeForCalc === 0n || marginForCalc === 0n || entryForCalc === 0n) return null;

    const lossUsdc6 = computeLossAtLiquidationUsdc6(
      marginForCalc,
      sizeForCalc,
      displayLiquidationPrice,
      maintenanceMarginBps,
    );
    const maintenanceUsdc6 = computeMaintenanceUsdc6(
      sizeForCalc,
      displayLiquidationPrice,
      maintenanceMarginBps,
    );
    const fullLossPrice = computeFullMarginLossPriceUsdc6(
      sideForPreview,
      sizeForCalc,
      marginForCalc,
      entryForCalc,
    );
    const dropPct = computePriceDropPct(entryForCalc, displayLiquidationPrice, sideForPreview);
    const effLev = effectiveLeverage(sizeForCalc, entryForCalc, marginForCalc);

    return {
      lossUsd: Number(lossUsdc6) / 1e6,
      maintenanceUsd: Number(maintenanceUsdc6) / 1e6,
      marginUsd: Number(marginForCalc) / 1e6,
      fullLossPriceUsd: fullLossPrice ? Number(fullLossPrice) / 1e6 : null,
      dropPct,
      effLev,
      maintenancePct: maintenanceMarginBps / 100,
    };
  }, [
    displayLiquidationPrice,
    hasPosition,
    position,
    side,
    previewSize,
    tradePriceUsdc6,
    marginParsed,
    priceUsdc6,
    maintenanceMarginBps,
  ]);

  async function finalizeTrade(message: string) {
    setStatus(message);
    setStatusIsError(false);
    setTrading(false);
    resetWrite();
    await refetchPosition();
    await refetchMarket();
    await refetchUsdcBalance();
    onTradeComplete?.();
    refreshAllBalances(queryClient);
  }

  async function ensureApproval(amount: bigint) {
    if (!publicClient || !address || !contractAddress) return;
    const allowance = await publicClient.readContract({
      address: ARC_USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address, contractAddress],
    });
    if (allowance >= amount) return;
    setStatus("Approving USDC…");
    const hash = await writeContractAsync({
      address: ARC_USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [contractAddress, maxUint256],
      chainId: ARC_CHAIN_ID,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    resetWrite();
  }

  async function handleOpen() {
    if (trading || isPending) return;
    if (!contractAddress || !ticker || !address || !publicClient) return;
    if (!isConnected) {
      setStatus("Connect wallet");
      setStatusIsError(true);
      return;
    }
    try {
      await ensureArc();
    } catch {
      setStatus("Switch to Arc Testnet");
      setStatusIsError(true);
      return;
    }
    if (paused) {
      setStatus("Perp engine is paused");
      setStatusIsError(true);
      return;
    }
    if (leverage > maxLeverage) {
      setStatus(`Max leverage for ${ticker} is ${maxLeverage}x`);
      setStatusIsError(true);
      return;
    }
    if (markPrice === 0n) {
      setStatus("Oracle mark not set — wait for price sync");
      setStatusIsError(true);
      return;
    }
    if (marginParsed === 0n || previewSize === 0n) {
      setStatus("Margin too low for this leverage at the on-chain mark");
      setStatusIsError(true);
      return;
    }

    setTrading(true);
    setStatus(null);
    try {
      await waitForWalletTxSlot(publicClient, address);
      const { data: freshMarket } = await refetchMarket();
      const chainMark = (freshMarket as readonly [boolean, bigint, bigint, bigint, number, number] | undefined)?.[1] ?? markPrice;
      const openSize = openSizeFromMargin(marginParsed, leverage, chainMark, maxLeverage);
      if (openSize === 0n) {
        throw new Error("InsufficientMargin");
      }
      await ensureApproval(marginParsed);
      resetWrite();
      await waitForWalletTxSlot(publicClient, address);
      setStatus("Opening position…");
      await publicClient.simulateContract({
        address: contractAddress,
        abi: perpContractAbi,
        functionName: "openPosition",
        args: [ticker, side === "long", marginParsed, openSize],
        account: address,
      });
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: perpContractAbi,
        functionName: "openPosition",
        args: [ticker, side === "long", marginParsed, openSize],
        chainId: ARC_CHAIN_ID,
      });
      setStatus("Confirming on Arc…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Open position transaction failed");
      await finalizeTrade(
        `Position opened · $${(Number(marginParsed) / 1e6).toFixed(2)} USDC locked in PerpEngine`,
      );
    } catch (err) {
      resetWrite();
      setStatus(formatTradeError(err));
      setStatusIsError(true);
      setTrading(false);
    }
  }

  async function handleClose() {
    if (trading || isPending) return;
    if (!contractAddress || !ticker || !address || !publicClient || !position || position.size === 0n) return;
    try {
      await ensureArc();
    } catch {
      setStatus("Switch to Arc Testnet");
      setStatusIsError(true);
      return;
    }

    setTrading(true);
    userClosingRef.current = true;
    setStatus("Closing position…");
    try {
      await waitForWalletTxSlot(publicClient, address);
      await refetchMarket();
      await refetchPosition();
      await publicClient.simulateContract({
        address: contractAddress,
        abi: perpContractAbi,
        functionName: "closePosition",
        args: [ticker, position.size],
        account: address,
      });
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: perpContractAbi,
        functionName: "closePosition",
        args: [ticker, position.size],
        chainId: ARC_CHAIN_ID,
      });
      setStatus("Confirming close on Arc…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Close position transaction failed");
      await finalizeTrade("Position closed · USDC returned to wallet");
    } catch (err) {
      resetWrite();
      setStatus(formatTradeError(err));
      setStatusIsError(true);
      setTrading(false);
    }
  }

  if (!contractReady) {
    return (
      <div className="glass-card rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 text-sm text-amber-200/90">
        Perp engine not deployed. Set <code className="text-amber-100">PERP_ENGINE_ADDRESS</code> after running{" "}
        <code className="text-amber-100">forge script script/DeployPerp.s.sol</code>.
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-400/80">
            Arc Testnet · Perp Engine
          </p>
          <h2 className="mt-0.5 text-2xl font-bold tracking-tight text-zinc-100">{ticker}</h2>
          <p className="mt-1 text-xs text-zinc-500">Long or short · USDC margin · on-chain liquidations</p>
          {contractAddress && (
            <p className="mt-1 font-mono text-[10px] text-zinc-600">
              {contractAddress.slice(0, 6)}…{contractAddress.slice(-4)}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-mono text-xl font-semibold text-zinc-100">
            ${displayPrice > 0 ? displayPrice.toFixed(2) : "—"}
          </p>
          <p className="text-[10px] text-zinc-600">
            mark price · {markModeLabel}
          </p>
          {onChainPrice > 0 && Math.abs(onChainPrice - displayPrice) > 0.05 && (
            <p className="mt-0.5 font-mono text-[10px] text-zinc-600">
              on-chain ${onChainPrice.toFixed(2)}
            </p>
          )}
          <span className="mt-1 inline-block rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
            Up to {maxLeverage}x
          </span>
        </div>
      </div>

      {hasPosition ? (
        <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold uppercase ${
                position.side === "long"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-rose-500/15 text-rose-400"
              }`}
            >
              {position.side}
            </span>
            <span className="text-xs text-zinc-500">
              {effectiveLeverage(position.size, markUsdc6ForPnl || priceUsdc6, position.margin).toFixed(1)}x effective
            </span>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            <span className="font-mono text-zinc-400">${lockedMarginUsd.toFixed(2)}</span> USDC locked in PerpEngine
            {walletUsdcUsd != null && (
              <>
                {" "}
                · wallet{" "}
                <span className="font-mono text-zinc-400">${walletUsdcUsd.toFixed(2)}</span> USDC
              </>
            )}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-white/[0.04] px-3 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Equity</p>
              <p className="mt-1 font-mono text-xl font-semibold text-zinc-100">
                ${liveEquityUsd.toFixed(2)}
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-600">settlement mark · {markModeLabel}</p>
            </div>
            <div className="rounded-lg bg-white/[0.04] px-3 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Unrealized P&L</p>
              <p
                className={`mt-1 font-mono text-xl font-semibold ${
                  livePnlUsdc6 >= 0n ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {formatPerpPnl(livePnlUsdc6)}
              </p>
              <p className={`mt-0.5 text-[10px] ${livePnlUsdc6 >= 0n ? "text-emerald-500/70" : "text-rose-500/70"}`}>
                {marginUsd > 0 ? `${((livePnlUsd / marginUsd) * 100).toFixed(1)}% on margin` : ""}
              </p>
            </div>
          </div>

          {(liveLiquidatable || livePastLiq) && (
            <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5">
              <p className="text-xs font-medium text-rose-400">
                {liveLiquidatable
                  ? "At risk — auto-liquidation queued (oracle mark catching up)"
                  : "Price at or past estimated liquidation level — closing when on-chain mark settles"}
              </p>
            </div>
          )}

          <div
            className={`mt-3 rounded-lg border px-3 py-2.5 ${
              livePnlUsdc6 >= 0n
                ? "border-emerald-500/20 bg-emerald-500/5"
                : "border-rose-500/20 bg-rose-500/5"
            }`}
          >
            <p className="text-xs text-zinc-400">
              If you close now → receive{" "}
              <span className={`font-mono font-semibold ${livePnlUsdc6 >= 0n ? "text-emerald-400" : "text-rose-400"}`}>
                ~${Math.max(0, liveEquityUsd).toFixed(2)} USDC
              </span>
            </p>
            <p className="mt-1 text-[11px] text-zinc-600">
              {Math.abs(onChainEquityUsd - liveEquityUsd) > 0.05
                ? `On-chain settlement ~$${Math.max(0, onChainEquityUsd).toFixed(2)} USDC`
                : "Matches on-chain settlement mark"}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[11px] text-zinc-500">Entry</p>
              <p className="font-medium text-zinc-200">${(Number(position.entryPrice) / 1e6).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[11px] text-zinc-500">Mark</p>
              <p className="font-medium text-zinc-200">
                ${displayPrice > 0 ? displayPrice.toFixed(2) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-zinc-500">Margin</p>
              <p className="font-medium text-zinc-200">{formatUsdc(position.margin)}</p>
            </div>
            <div>
              <p className="text-[11px] text-zinc-500">Liq. price</p>
              <p className="font-medium text-amber-400/90">
                {formatLiquidationPrice(displayLiquidationPrice)}
              </p>
            </div>
          </div>
          {liqContext && (
            <div className="mt-3 rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-500">
              <p className="text-zinc-400">
                At liq. price you lose{" "}
                <span className="font-mono font-medium text-amber-300">
                  ~${liqContext.lossUsd.toFixed(2)}
                </span>{" "}
                of your ${liqContext.marginUsd.toFixed(2)} margin ({liqContext.dropPct.toFixed(1)}%{" "}
                {position.side === "long" ? "drop" : "rise"} · {liqContext.effLev.toFixed(1)}x).
              </p>
              <p className="mt-1">
                Liquidation triggers when equity hits the {liqContext.maintenancePct.toFixed(1)}%
                maintenance buffer (~${liqContext.maintenanceUsd.toFixed(2)}), not when margin hits $0.
                {liqContext.fullLossPriceUsd != null && (
                  <>
                    {" "}
                    Full margin loss would be near ${liqContext.fullLossPriceUsd.toFixed(2)}.
                  </>
                )}
              </p>
            </div>
          )}
          <button
            onClick={() => void handleClose()}
            disabled={trading || isPending}
            className="mt-4 w-full rounded-xl bg-rose-500 py-3 text-sm font-bold text-white shadow-lg shadow-rose-500/25 transition hover:bg-rose-400 disabled:opacity-50"
          >
            Close position
          </button>
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-white/[0.02] p-1">
            {(["long", "short"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setSide(value)}
                className={`rounded-lg py-2.5 text-sm font-semibold capitalize transition-all ${
                  side === value
                    ? value === "long"
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                      : "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {value}
              </button>
            ))}
          </div>

          <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Margin (USDC)
          </label>
          <input
            type="number"
            step="any"
            min="0"
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            placeholder="0.00"
            className="mb-4 w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 font-mono text-lg text-zinc-100 outline-none transition-all placeholder:text-zinc-700 focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/10"
          />

          <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Leverage
          </label>
          <div className="mb-4 flex flex-wrap gap-2 rounded-xl bg-white/[0.02] p-2">
            {LEVERAGE_OPTIONS.filter((l) => l <= maxLeverage).map((l) => (
              <button
                key={l}
                onClick={() => setLeverage(l)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  leverage === l
                    ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                    : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                }`}
              >
                {l}x
              </button>
            ))}
          </div>

          <div className="mb-4 flex items-center justify-between rounded-xl bg-white/[0.02] px-4 py-3">
            <span className="text-xs text-zinc-500">Notional</span>
            <span className="font-mono text-sm font-medium text-zinc-300">
              ${marginParsed > 0n ? ((Number(marginParsed) / 1e6) * leverage).toFixed(2) : "0.00"}
            </span>
          </div>
          <div className="mb-4 flex items-center justify-between rounded-xl bg-white/[0.02] px-4 py-3">
            <span className="text-xs text-zinc-500">Wallet USDC</span>
            <span className="font-mono text-sm font-medium text-zinc-300">
              {formatUsdc(usdcBalanceRaw ?? 0n)}
            </span>
          </div>
          <div className="mb-4 rounded-xl border border-amber-500/15 bg-amber-500/5 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs text-amber-400/80">Est. liq. price</span>
                <p className="mt-0.5 text-[10px] text-zinc-600">At live mark · {leverage}x</p>
              </div>
              <span className="font-mono text-sm font-medium text-amber-300">
                {formatLiquidationPrice(displayLiquidationPrice)}
              </span>
            </div>
            {liqContext && (
              <p className="mt-2 border-t border-amber-500/10 pt-2 text-[11px] leading-relaxed text-zinc-500">
                Lose ~${liqContext.lossUsd.toFixed(2)} of ${liqContext.marginUsd.toFixed(2)} margin (
                {liqContext.dropPct.toFixed(1)}% move at {leverage}x). Maintenance buffer:{" "}
                {liqContext.maintenancePct.toFixed(1)}% of ${(liqContext.marginUsd * leverage).toFixed(0)} notional.
                {liqContext.fullLossPriceUsd != null && (
                  <> Wiped out near ${liqContext.fullLossPriceUsd.toFixed(2)}.</>
                )}
              </p>
            )}
          </div>

          {!isConnected && (
            <p className="mb-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
              Connect wallet to trade
            </p>
          )}
          {isConnected && !onArc && (
            <p className="mb-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
              Switch to Arc Testnet to trade
            </p>
          )}

          <button
            onClick={() => void handleOpen()}
            disabled={trading || isPending || isSwitching || marginParsed === 0n || !isConnected}
            className={`w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all disabled:opacity-40 disabled:shadow-none ${
              side === "long"
                ? "bg-emerald-500 shadow-lg shadow-emerald-500/25 hover:bg-emerald-400 hover:shadow-emerald-500/35"
                : "bg-rose-500 shadow-lg shadow-rose-500/25 hover:bg-rose-400 hover:shadow-rose-500/35"
            }`}
          >
            {trading || isPending
              ? "Confirming…"
              : `Open ${side} ${leverage}x`}
          </button>
        </>
      )}

      {status && (
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            statusIsError ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"
          }`}
        >
          {status}
        </div>
      )}

      <p className="mt-4 text-[10px] leading-relaxed text-zinc-600">
        Cash-settled perps · margin USDC stays in PerpEngine until close or liquidation
        {poolUsdcUsd != null && (
          <>
            {" "}
            · pool ${poolUsdcUsd.toFixed(2)}
            {insuranceUsd != null && ` · insurance $${insuranceUsd.toFixed(2)}`}
          </>
        )}
      </p>

      {liquidationAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-rose-500/30 bg-zinc-900 p-6 shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/15">
              <svg className="h-7 w-7 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h3 className="text-center text-lg font-bold text-zinc-100">Position liquidated</h3>
            <p className="mt-2 text-center text-sm text-zinc-400">
              Your {liquidationAlert.side} {liquidationAlert.ticker} position was closed because margin fell below
              the maintenance threshold. Remaining collateral was added to the engine pool for winner payouts.
            </p>
            <button
              onClick={() => setLiquidationAlert(null)}
              className="mt-5 w-full rounded-xl bg-rose-500 py-3 text-sm font-bold text-white transition hover:bg-rose-400"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
