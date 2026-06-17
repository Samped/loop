#!/usr/bin/env npx tsx
/** Copy data/perp-mark-history.json to public/perp-mark-cache.json for Vercel cold starts. */
import { copyFileSync, existsSync } from "fs";
import { resolve } from "path";

const src = resolve(__dirname, "../data/perp-mark-history.json");
const dest = resolve(__dirname, "../public/perp-mark-cache.json");

if (!existsSync(src)) {
  console.error("Missing data/perp-mark-history.json — run the app locally so the mark engine records bars");
  process.exit(1);
}

copyFileSync(src, dest);
console.log(`Updated ${dest}`);
