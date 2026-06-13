#!/usr/bin/env npx tsx
/**
 * Ingest SoSoValue headlines into data/news.json.
 * Usage: npm run sync-news
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvFile(path: string, override = false) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (override || !process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(resolve(__dirname, "../.env.local"), true);
loadEnvFile(resolve(__dirname, "../.env"));

async function main() {
  const { hydrateSnapshotStore } = await import("../src/lib/snapshot-store");
  const { hydrateNewsStore, getStoredNewsArticles } = await import("../src/lib/news-store");
  const { syncNewsNow } = await import("../src/lib/news-syncer");

  hydrateSnapshotStore();
  hydrateNewsStore();

  console.log("Syncing SoSoValue news…");
  const ingested = await syncNewsNow({ tickerSearch: false });
  const total = getStoredNewsArticles(500).length;
  const status = (await import("../src/lib/news-syncer")).getNewsSyncStatus();

  if (total === 0) {
    console.error("No articles ingested.", status.lastError ?? "Check SOSOVALUE_API_KEY and rate limits.");
    process.exit(1);
  }

  console.log(`Ingested ${ingested} articles (${total} total in store)`);

  const sample = getStoredNewsArticles(3);
  for (const article of sample) {
    console.log(`- ${article.title.slice(0, 72)}… (${article.author})`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
