#!/usr/bin/env npx tsx
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

async function main() {
  const { syncPerpMarkPrices } = await import("../src/lib/perp-oracle");
  const result = await syncPerpMarkPrices(["MSTR", "COIN", "HOOD", "MARA", "RIOT"]);
  console.log(result);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
