import type { NewsItem } from "@/lib/news";
import { normalizeSosoArticle, storedToNewsItem } from "@/lib/news";
import {
  getStoredNewsArticle,
  hydrateNewsStore,
  upsertNewsArticles,
} from "@/lib/news-store";
import { getCachedCryptoStocks } from "@/lib/market-data";
import { hydrateSnapshotStore } from "@/lib/snapshot-store";
import {
  getFeaturedNews,
  getHotNews,
  getNewsFeed,
  type SosoNewsArticle,
} from "@/lib/sosovalue";

async function getCatalog() {
  hydrateSnapshotStore();
  try {
    const { stocks } = await getCachedCryptoStocks();
    return stocks;
  } catch {
    return [];
  }
}

async function findInSoSoFeeds(id: string): Promise<SosoNewsArticle | null> {
  if (!process.env.SOSOVALUE_API_KEY) return null;

  const sources = [
    () => getNewsFeed(1, 50),
    () => getHotNews(50),
    () => getFeaturedNews(50),
    () => getNewsFeed(2, 50),
    () => getNewsFeed(3, 50),
    () => getNewsFeed(4, 50),
    () => getNewsFeed(5, 50),
  ];

  for (const source of sources) {
    try {
      const list = await source();
      const hit = list.find((a) => a.id === id);
      if (hit) return hit;
    } catch {
      continue;
    }
  }

  return null;
}

function pickLongerText(...values: Array<string | undefined>): string {
  return values
    .map((v) => v?.trim() ?? "")
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] ?? "";
}

function patchStoredArticle(stored: NonNullable<ReturnType<typeof getStoredNewsArticle>>) {
  const content = pickLongerText(stored.content, stored.summary, stored.title);
  return { ...stored, content };
}

/** Resolve a news article from local store or live SoSoValue feeds. */
export async function resolveNewsArticle(id: string): Promise<NewsItem | null> {
  hydrateSnapshotStore();
  hydrateNewsStore();

  const stored = getStoredNewsArticle(id);
  const catalog = await getCatalog();

  const raw = await findInSoSoFeeds(id);
  if (raw) {
    const normalized = normalizeSosoArticle(raw, catalog);
    if (normalized) {
      const merged = stored
        ? {
            ...normalized,
            content: pickLongerText(normalized.content, stored.content, stored.summary, stored.title),
            summary: normalized.summary || stored.summary,
          }
        : normalized;
      upsertNewsArticles([merged]);
      return storedToNewsItem(merged);
    }
  }

  if (stored) {
    const item = storedToNewsItem(patchStoredArticle(stored));
    return item;
  }
  return null;
}
