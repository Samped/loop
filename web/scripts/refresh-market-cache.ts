#!/usr/bin/env npx tsx
/** Copy data/market.json to public/market-cache.json for instant Vercel cold starts. */
import { copyFileSync, existsSync } from "fs";
import { resolve } from "path";

const src = resolve(__dirname, "../data/market.json");
const dest = resolve(__dirname, "../public/market-cache.json");

if (!existsSync(src)) {
  console.error("Missing data/market.json — run npm run fetch-snapshots first");
  process.exit(1);
}

copyFileSync(src, dest);
console.log(`Updated ${dest}`);
