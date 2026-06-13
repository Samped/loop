"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useMounted } from "@/hooks/useMounted";
import { formatUsdc } from "@/lib/usdc";
import { ARC_CHAIN_ID } from "@/lib/arc-chain-utils";
import { useEnsureArcChain } from "@/hooks/useEnsureArcChain";
import { useUsdcBalance } from "@/hooks/useUsdcBalance";

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletButton() {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { onArc, ensureArc, isSwitching } = useEnsureArcChain();

  const { data: usdcBalance } = useUsdcBalance({ enabled: mounted });

  if (!mounted) {
    return <div className="h-9 w-24 animate-pulse rounded-lg bg-white/[0.04]" />;
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 md:flex">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="font-mono text-xs text-zinc-400">{shortenAddress(address)}</span>
          {usdcBalance != null && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="font-mono text-xs font-medium text-zinc-200">
                ${Number(formatUsdc(usdcBalance)).toFixed(2)}
              </span>
            </>
          )}
        </div>

        {!onArc && (
          <button
            onClick={() => ensureArc()}
            disabled={isSwitching}
            className="rounded-lg bg-amber-500/90 px-2.5 py-1.5 text-[11px] font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
          >
            {isSwitching ? "…" : "Arc"}
          </button>
        )}

        <button
          onClick={() => disconnect()}
          className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-white/[0.14] hover:text-zinc-200"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: connectors[0], chainId: ARC_CHAIN_ID })}
      disabled={isPending}
      className="btn-primary rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 sm:text-sm"
    >
      {isPending ? "Connecting…" : "Connect"}
    </button>
  );
}
