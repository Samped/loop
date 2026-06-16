#!/usr/bin/env npx tsx
/**
 * Fetch all SoSoValue snapshots and save to data/market.json (~1 min).
 * Usage: npm run fetch-snapshots
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(resolve(__dirname, "../.env.local"));
loadEnvFile(resolve(__dirname, "../.env"));

async function main() {
  const { hydrateSnapshotStore } = await import("../src/lib/snapshot-store");
  const { getCachedCryptoStocks, getCachedSectors } = await import("../src/lib/market-data");
  const { warmAllSnapshots } = await import("../src/lib/snapshot-warmer");
  const { setStoredStocks, setStoredSectors } = await import("../src/lib/snapshot-store");

  hydrateSnapshotStore();

  console.log("Fetching stock list and sectors…");
  const [{ stocks }, { sectors }] = await Promise.all([getCachedCryptoStocks(), getCachedSectors()]);
  setStoredStocks(stocks);
  setStoredSectors(sectors);
  console.log(`Loaded ${stocks.length} stocks, ${sectors.length} sectors`);

  console.log("Fetching price + chart data for each stock (~3 min per 10 stocks)…");
  let total = 0;
  for (let round = 1; round <= 15; round++) {
    const count = await warmAllSnapshots();
    if (count === total) break;
    total = count;
    console.log(`Round ${round}: ${total}/${stocks.length} stocks fully synced`);
    if (total >= stocks.length) break;
  }
  console.log(`Done — ${total} stocks with price + chart saved to data/market.json`);

  const { copyFileSync } = await import("fs");
  const { resolve } = await import("path");
  copyFileSync(resolve(__dirname, "../data/market.json"), resolve(__dirname, "../public/market-cache.json"));
  console.log("Updated public/market-cache.json for production deploy");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
