"use client";

import { useEffect, useState } from "react";
import type { NewsItem } from "@/lib/news";
import { NewsFeed } from "@/components/NewsFeed";

export default function NewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/news")
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  const articles = items.filter((item) => item.category === "article" || item.source === "sosovalue");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">News</h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          {loading ? "Loading headlines…" : `${articles.length} stories · tap to read in app`}
        </p>
      </header>

      <NewsFeed
        items={articles}
        loading={loading}
        emptyMessage="Headlines sync in the background. Check back in a few minutes."
      />
    </div>
  );
}
