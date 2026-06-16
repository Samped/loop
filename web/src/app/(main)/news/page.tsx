"use client";

import { useCallback, useEffect, useState } from "react";
import type { NewsItem } from "@/lib/news";
import { NewsFeed } from "@/components/NewsFeed";
import { fetchJson } from "@/lib/fetch-json";

const POLL_MS = 45_000;

type NewsSyncInfo = {
  running?: boolean;
  lastSyncAt?: number | null;
  sources?: {
    sosovalue?: boolean;
    finnhub?: boolean;
    cryptopanic?: boolean;
    markets?: boolean;
    crypto?: boolean;
  };
};

type NewsApiResponse = {
  items?: NewsItem[];
  source?: string;
  sync?: NewsSyncInfo;
};

export default function NewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [sync, setSync] = useState<NewsSyncInfo | null>(null);
  const [source, setSource] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    const url = refresh ? "/api/news?refresh=1" : "/api/news";
    const data = await fetchJson<NewsApiResponse>(url);
    if (!data) return;
    setItems(data.items ?? []);
    setSync(data.sync ?? null);
    setSource(data.source ?? null);
    setInitialLoad(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      void load(false);
    };

    tick();
    const interval = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [load]);

  const articles = items.filter(
    (item) => item.category === "article" && item.source && item.source !== "synthetic",
  );

  const activeSources = sync?.sources
    ? [
        sync.sources.sosovalue && "SoSoValue",
        sync.sources.finnhub && "Finnhub",
        sync.sources.cryptopanic && "CryptoPanic",
        sync.sources.markets && "Market News",
        sync.sources.crypto && "Crypto",
      ].filter(Boolean)
    : [];

  const handleRefresh = useCallback(() => {
    void load(true);
    for (const delay of [5_000, 12_000, 25_000]) {
      setTimeout(() => void load(false), delay);
    }
  }, [load]);

  const syncing = Boolean(sync?.running) || source === "syncing";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">News</h1>
            <p className="mt-1.5 text-sm text-zinc-500">
              {initialLoad
                ? "Loading headlines…"
                : `${articles.length} stories · tap to read in app`}
            </p>
            {!initialLoad && activeSources.length > 0 && (
              <p className="mt-2 text-xs text-zinc-600">
                Sources: {activeSources.join(" · ")}
              </p>
            )}
          </div>
          {!initialLoad && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={syncing}
              className="shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "Refresh"}
            </button>
          )}
        </div>
      </header>

      <NewsFeed
        items={articles}
        loading={initialLoad}
        emptyMessage={
          syncing
            ? "Fetching latest headlines…"
            : "Headlines sync in the background. Check back in a few minutes."
        }
      />
    </div>
  );
}
