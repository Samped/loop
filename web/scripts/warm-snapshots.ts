#!/usr/bin/env npx tsx
import { spawnSync } from "child_process";
import { resolve } from "path";

spawnSync("npx", ["tsx", resolve(__dirname, "fetch-all-snapshots.ts")], {
  stdio: "inherit",
  env: process.env,
});
