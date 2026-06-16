import { NextResponse } from "next/server";
import { getNewsSyncStatus, syncNewsNow } from "@/lib/news-syncer";
import { getStoredNewsArticles, hydrateNewsStore } from "@/lib/news-store";
import { rateLimit, requireAdmin } from "@/lib/api-guard";

export async function POST(req: Request) {
  const limited = rateLimit(req, "api:news-sync-post", 10, 60_000);
  if (limited) return limited;
  const denied = requireAdmin(req);
  if (denied) return denied;

  const hasSource = Boolean(
    process.env.SOSOVALUE_API_KEY || process.env.FINNHUB_API_KEY || process.env.CRYPTOPANIC_API_KEY,
  );
  if (!hasSource) {
    return NextResponse.json({ error: "No news API keys configured" }, { status: 503 });
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
