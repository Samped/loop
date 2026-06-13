"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import type { NewsItem } from "@/lib/news";
import { timeAgo } from "@/lib/news";

function TickerPills({ tickers, linked = false }: { tickers?: string[]; linked?: boolean }) {
  const valid = tickers?.filter((t) => /^[A-Z]{1,5}$/.test(t));
  if (!valid?.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {valid.slice(0, 4).map((ticker) =>
        linked ? (
          <Link
            key={ticker}
            href={`/stock/${ticker}`}
            className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400 transition-colors hover:bg-emerald-500/20"
          >
            {ticker}
          </Link>
        ) : (
          <span
            key={ticker}
            className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/80"
          >
            {ticker}
          </span>
        ),
      )}
    </div>
  );
}

function NewsRow({ item, compact = false }: { item: NewsItem; compact?: boolean }) {
  const router = useRouter();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/news/${item.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/news/${item.id}`);
        }
      }}
      className="group block cursor-pointer border-b border-white/[0.05] px-1 py-4 transition-colors last:border-0 hover:bg-white/[0.02] sm:px-3 sm:py-5"
    >
      <div className="flex gap-4 sm:gap-6">
        <div className="hidden w-14 shrink-0 pt-0.5 sm:block">
          <span className="font-mono text-[11px] text-zinc-600">{timeAgo(item.timestamp)}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2 sm:hidden">
            <span className="font-mono text-[10px] text-zinc-600">{timeAgo(item.timestamp)}</span>
            {item.author && (
              <>
                <span className="text-zinc-700">·</span>
                <span className="text-[10px] text-zinc-500">{item.author}</span>
              </>
            )}
          </div>

          <h2
            className={`font-semibold leading-snug text-zinc-100 transition-colors group-hover:text-emerald-300 ${
              compact ? "text-sm" : "text-base sm:text-[17px]"
            }`}
          >
            {item.title}
          </h2>

          <p
            className={`mt-2 leading-relaxed text-zinc-500 ${
              compact ? "line-clamp-2 text-xs" : "line-clamp-2 text-sm sm:line-clamp-3"
            }`}
          >
            {item.summary}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {item.author && (
              <span className="hidden text-[11px] text-zinc-600 sm:inline">{item.author}</span>
            )}
            <TickerPills tickers={item.tickers} />
          </div>
        </div>

        <div className="flex shrink-0 items-center pt-1 text-zinc-600 transition-colors group-hover:text-emerald-400">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  );
}

export function NewsFeed({
  items,
  loading,
  compact = false,
  emptyMessage = "No articles yet.",
}: {
  items: NewsItem[];
  loading?: boolean;
  compact?: boolean;
  emptyMessage?: string;
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center py-16">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
        <p className="mt-3 text-sm text-zinc-500">Loading news…</p>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-12 text-center">
        <p className="text-sm text-zinc-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
      {items.map((item) => (
        <NewsRow key={item.id} item={item} compact={compact} />
      ))}
    </div>
  );
}
