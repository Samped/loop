import { NextResponse } from "next/server";
import { getNewsSyncStatus, syncNewsNow } from "@/lib/news-syncer";
import { getStoredNewsArticles, hydrateNewsStore } from "@/lib/news-store";

export async function POST() {
  if (!process.env.SOSOVALUE_API_KEY) {
    return NextResponse.json({ error: "SOSOVALUE_API_KEY not configured" }, { status: 503 });
  }

  hydrateNewsStore();
  const ingested = await syncNewsNow({ tickerSearch: false });
  const status = getNewsSyncStatus();

  return NextResponse.json({
    ingested,
    articleCount: getStoredNewsArticles(500).length,
    status,
  });
}
