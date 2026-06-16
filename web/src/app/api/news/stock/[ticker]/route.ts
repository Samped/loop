import { NextResponse } from "next/server";
import { storedToNewsItem } from "@/lib/news";
import { getStoredNewsForTicker, hydrateNewsStore } from "@/lib/news-store";
import { requestNewsSync, startNewsSyncer } from "@/lib/news-syncer";
import { hydrateSnapshotStore } from "@/lib/snapshot-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  hydrateSnapshotStore();
  hydrateNewsStore();
  startNewsSyncer();
  requestNewsSync({ tickerSearch: false });

  const articles = getStoredNewsForTicker(upper, 50).map(storedToNewsItem);

  return NextResponse.json({
    ticker: upper,
    items: articles,
    source: articles.length ? "sosovalue" : "empty",
  });
}
