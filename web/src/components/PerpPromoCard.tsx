"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type DashboardStatCardProps = {
  label: string;
  value: string;
  sub?: string;
  accent?: "emerald" | "violet";
  href?: string;
  footer?: ReactNode;
};

function CardInner({
  label,
  value,
  sub,
  accent = "emerald",
  footer,
  interactive = false,
}: Omit<DashboardStatCardProps, "href"> & { interactive?: boolean }) {
  const labelColor = accent === "violet" ? "text-violet-400/90" : "text-zinc-500";
  const accentBar = accent === "violet" ? "bg-violet-500/70" : "bg-emerald-500/70";

  return (
    <div
      className={`glass-card flex h-full min-h-[7.5rem] flex-col rounded-2xl p-4 sm:min-h-[8rem] sm:p-5 ${
        interactive ? "transition group-hover:border-white/[0.12] group-hover:bg-white/[0.04]" : ""
      }`}
    >
      <div className={`mb-3 h-0.5 w-8 rounded-full ${accentBar}`} aria-hidden />
      <p className={`text-[11px] font-medium uppercase tracking-wider ${labelColor}`}>{label}</p>
      <p className="mt-1.5 text-base font-semibold text-zinc-100 sm:text-lg">{value}</p>
      {sub && (
        <p className={`mt-1 text-xs leading-relaxed text-zinc-500 ${interactive ? "pr-10 sm:pr-11" : ""}`}>
          {sub}
        </p>
      )}
      {footer ? <div className="mt-auto pt-3">{footer}</div> : <div className="mt-auto" />}
    </div>
  );
}

export function DashboardStatCard(props: DashboardStatCardProps) {
  const { href, ...inner } = props;

  if (href) {
    return (
      <Link
        href={href}
        className="group block h-full rounded-2xl transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
      >
        <div className="relative h-full">
          <CardInner {...inner} interactive />
          <span className="pointer-events-none absolute bottom-4 right-4 flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-zinc-500 transition group-hover:border-emerald-500/25 group-hover:bg-emerald-500/10 group-hover:text-emerald-300 sm:bottom-5 sm:right-5">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </Link>
    );
  }

  return <CardInner {...inner} />;
}

export function PerpPromoCard() {
  return (
    <DashboardStatCard
      label="Perpetuals"
      value="5 markets"
      sub="Up to 20x leverage · Long & short · USDC settled"
      accent="emerald"
      href="/perp"
      footer={
        <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full w-full rounded-full bg-emerald-500/50" />
        </div>
      }
    />
  );
}
