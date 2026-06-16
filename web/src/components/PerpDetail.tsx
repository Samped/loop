"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CryptoStock, MarketSnapshot } from "@/lib/sosovalue";
import { StockOverview } from "@/components/StockOverview";
import { PerpPanel } from "@/components/PerpPanel";
import { PerpLiveMarkChart } from "@/components/PerpLiveMarkChart";
import { useLivePerpMark } from "@/hooks/useLivePerpMark";

type StockApiResponse = { stock?: CryptoStock };
type SnapshotApiResponse = { snapshot?: MarketSnapshot };

export function PerpDetail({ ticker }: { ticker: string }) {
  const upper = ticker.toUpperCase();
  const [stock, setStock] = useState<CryptoStock | null>(null);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const { livePrice } = useLivePerpMark(upper, snapshot?.mkt_price);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [stockRes, snapRes] = await Promise.all([
          fetch(`/api/market/stock/${upper}`).then(
            (r): Promise<StockApiResponse> => (r.ok ? r.json() : Promise.resolve({})),
          ),
          fetch(`/api/market/snapshot/${upper}`).then(
            (r): Promise<SnapshotApiResponse> => (r.ok ? r.json() : Promise.resolve({})),
          ),
        ]);

        setStock(
          stockRes.stock ?? {
            ticker: upper,
            name: upper,
            exchange: "",
            sector: "",
            introduction: "",
            listing_time: "",
          },
        );
        setSnapshot(snapRes.snapshot ?? null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [upper]);

  useEffect(() => {
    if (!livePrice || livePrice <= 0) return;
    const id = setTimeout(() => {
      setSnapshot((prev) =>
        prev
          ? { ...prev, mkt_price: livePrice, timestamp: Date.now() }
          : {
              timestamp: Date.now(),
              ticker: upper,
              mkt_price: livePrice,
              mkt_status: "open",
              volume: 0,
              turnover: 0,
              circulating_marketcap: 0,
              total_marketcap: 0,
              pe_ttm: 0,
              pb: 0,
            },
      );
    }, 0);
    return () => clearTimeout(id);
  }, [livePrice, upper]);

  const stockInfo = stock ?? {
    ticker: upper,
    name: upper,
    exchange: "",
    sector: "",
    introduction: "",
    listing_time: "",
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/perp"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to perp markets
      </Link>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
          <p className="mt-4 text-sm text-zinc-500">Loading perp market…</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
          <div className="space-y-6 lg:col-span-3">
            <PerpLiveMarkChart ticker={upper} />
            <StockOverview stock={stockInfo} snapshot={snapshot} />
          </div>

          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-24">
              <PerpPanel ticker={upper} snapshot={snapshot} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
