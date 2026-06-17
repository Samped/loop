#!/usr/bin/env npx tsx
/** Copy data/news.json to public/news-cache.json for instant Vercel cold starts. */
import { copyFileSync, existsSync } from "fs";
import { resolve } from "path";

const src = resolve(__dirname, "../data/news.json");
const dest = resolve(__dirname, "../public/news-cache.json");

if (!existsSync(src)) {
  console.error("Missing data/news.json — run npm run sync-news first");
  process.exit(1);
}

copyFileSync(src, dest);
console.log(`Updated ${dest}`);
