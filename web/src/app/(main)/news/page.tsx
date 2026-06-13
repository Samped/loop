"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NewsItem } from "@/lib/news";

function categoryStyle(category: NewsItem["category"]) {
  switch (category) {
    case "article":
      return "bg-violet-500/10 text-violet-400";
    case "sector":
      return "bg-blue-500/10 text-blue-400";
    case "stock":
      return "bg-emerald-500/10 text-emerald-400";
    default:
      return "bg-white/[0.06] text-zinc-400";
  }
}

function categoryLabel(category: NewsItem["category"]) {
  if (category === "article") return "news";
  return category;
}

function timeAgo(ts: number) {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [source, setSource] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/news")
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items ?? []);
        setSource(data.source ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      {!loading && source && (
        <p className="mb-4 text-xs text-zinc-600">
          {source === "sosovalue"
            ? "Live headlines via SoSoValue"
            : source === "syncing"
              ? "Fetching headlines from SoSoValue…"
              : "Demo feed — set SOSOVALUE_API_KEY for live news"}
        </p>
      )}

      {loading ? (
        <div className="flex flex-col items-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
          <p className="mt-4 text-sm text-zinc-500">Loading news…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center">
          <p className="text-sm text-zinc-400">No articles yet. News sync runs in the background every few minutes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.id} className="glass-card rounded-2xl p-5 transition-all hover:border-white/[0.12]">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${categoryStyle(item.category)}`}>
                  {categoryLabel(item.category)}
                </span>
                {item.changePct != null && (
                  <span
                    className={`font-mono text-xs font-medium ${
                      item.changePct >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {item.changePct >= 0 ? "+" : ""}
                    {item.changePct.toFixed(2)}%
                  </span>
                )}
                {item.author && item.category === "article" && (
                  <span className="text-[11px] text-zinc-500">{item.author}</span>
                )}
                <span className="text-[11px] text-zinc-600">{timeAgo(item.timestamp)}</span>
              </div>

              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                >
                  <h2 className="text-base font-semibold text-zinc-100 group-hover:text-emerald-300">
                    {item.title}
                  </h2>
                </a>
              ) : (
                <h2 className="text-base font-semibold text-zinc-100">{item.title}</h2>
              )}

              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.summary}</p>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300"
                  >
                    Read article →
                  </a>
                )}
                {item.ticker && (
                  <Link
                    href={`/stock/${item.ticker}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-300"
                  >
                    View {item.ticker} chart
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
