#!/usr/bin/env npx tsx
/**
 * Sync SoSoValue prices to StockExchange on Arc Testnet.
 * Usage: npm run sync-prices
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
  const { syncPricesToContract } = await import("../src/lib/oracle");
  console.log("Syncing SoSoValue prices to StockVault on Arc Testnet…");
  const result = await syncPricesToContract();
  console.log(`Synced ${result.tickers.length} tickers (${result.source} data)`);
  console.log("Tickers:", result.tickers.join(", "));
  console.log("Tx:", result.txHash);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
