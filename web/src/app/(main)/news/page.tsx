"use client";

import { useEffect, useState } from "react";
import type { NewsItem } from "@/lib/news";
import { NewsFeed } from "@/components/NewsFeed";

type NewsSyncInfo = {
  sources?: {
    sosovalue?: boolean;
    finnhub?: boolean;
    cryptopanic?: boolean;
    markets?: boolean;
    crypto?: boolean;
  };
};

export default function NewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sync, setSync] = useState<NewsSyncInfo | null>(null);

  useEffect(() => {
    fetch("/api/news")
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items ?? []);
        setSync(data.sync ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">News</h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          {loading
            ? "Loading headlines…"
            : `${articles.length} stories · tap to read in app`}
        </p>
        {!loading && activeSources.length > 0 && (
          <p className="mt-2 text-xs text-zinc-600">
            Sources: {activeSources.join(" · ")}
          </p>
        )}
      </header>

      <NewsFeed
        items={articles}
        loading={loading}
        emptyMessage="Headlines sync in the background. Check back in a few minutes."
      />
    </div>
  );
}
