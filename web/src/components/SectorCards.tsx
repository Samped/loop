"use client";

import { useMemo } from "react";
import type { Sector } from "@/lib/sosovalue";

function formatPct(value: number) {
  const pct = value * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function formatCap(value: number) {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
}

function SectorCard({ sector }: { sector: Sector }) {
  const positive = sector.change_pct_24h >= 0;

  return (
    <div className="glass-card glass-card-hover min-w-[160px] shrink-0 rounded-2xl p-4 transition-all">
      <p className="truncate text-sm font-medium capitalize text-zinc-300">{sector.sector_name}</p>
      <p className={`mt-2 font-mono text-xl font-semibold ${positive ? "text-emerald-400" : "text-rose-400"}`}>
        {formatPct(sector.change_pct_24h)}
      </p>
      <p className="mt-1 text-[11px] text-zinc-600">{formatCap(sector.total_marketcap)}</p>
    </div>
  );
}

export function SectorCards({ sectors, source }: { sectors: Sector[]; source: string }) {
  const filtered = useMemo(() => sectors.filter((s) => s.sector_name !== "all"), [sectors]);
  const marqueeItems = useMemo(() => [...filtered, ...filtered], [filtered]);

  if (filtered.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Sectors</h2>
        <span className="text-[11px] text-zinc-600">{source === "sosovalue" ? "SoSoValue" : "Cached"}</span>
      </div>

      <div className="sector-marquee-mask -mx-4 overflow-hidden px-4 sm:mx-0 sm:px-0">
        <div className="sector-marquee-track flex w-max gap-3 pb-1">
          {marqueeItems.map((sector, index) => (
            <SectorCard key={`${sector.sector_name}-${index}`} sector={sector} />
          ))}
        </div>
      </div>
    </section>
  );
}
