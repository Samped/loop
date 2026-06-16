import "server-only";
import { neon } from "@neondatabase/serverless";
import { isNeonCircuitOpen, isNeonEnabled } from "@/lib/neon-guard";

let cached: ReturnType<typeof neon> | null = null;

export function getNeonSql() {
  if (!isNeonEnabled() || isNeonCircuitOpen()) return null;
  const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) return null;
  if (!cached) cached = neon(url);
  return cached;
}
