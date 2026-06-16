"use client";

import { useEffect, useState } from "react";

const POLL_MS = 300;

export type LivePerpMark = {
  livePrice: number | null;
  twapPrice: number | null;
  anchorPrice: number | null;
  mode: "live" | "gbm" | "closed" | "frozen" | null;
  simulated: boolean;
  marketOpen: boolean;
  sourceCount: number;
  updatedAt: number | null;
};

/**
 * Polls the server mark engine — same source the oracle writes on-chain.
 * No client-side price simulation.
 */
export function useLivePerpMark(ticker: string, fallbackBase?: number): LivePerpMark {
  const upper = ticker.toUpperCase();
  const [mark, setMark] = useState<LivePerpMark>({
    livePrice: fallbackBase && fallbackBase > 0 ? fallbackBase : null,
    twapPrice: null,
    anchorPrice: fallbackBase && fallbackBase > 0 ? fallbackBase : null,
    mode: null,
    simulated: false,
    marketOpen: true,
    sourceCount: 0,
    updatedAt: null,
  });

  useEffect(() => {
    if (!upper) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/perp/mark/${upper}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          price?: number;
          twapPrice?: number;
          anchorPrice?: number;
          mode?: "live" | "gbm" | "closed" | "frozen";
          marketOpen?: boolean;
          sourceCount?: number;
          updatedAt?: number;
        };
        if (typeof data.price !== "number" || data.price <= 0) return;
        if (cancelled) return;
        setMark({
          livePrice: data.price,
          twapPrice: typeof data.twapPrice === "number" ? data.twapPrice : data.price,
          anchorPrice: typeof data.anchorPrice === "number" ? data.anchorPrice : data.price,
          mode: data.mode ?? null,
          simulated: data.mode === "gbm",
          marketOpen: data.marketOpen !== false,
          sourceCount: typeof data.sourceCount === "number" ? data.sourceCount : 0,
          updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
        });
      } catch {
        // keep last mark
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [upper]);

  return mark;
}
