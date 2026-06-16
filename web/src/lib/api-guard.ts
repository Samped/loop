import "server-only";
import { NextResponse } from "next/server";

type Counter = { count: number; resetAt: number };

const buckets = new Map<string, Counter>();

function getClientIp(req: Request): string {
  const xfwd = req.headers.get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function nowMs() {
  return Date.now();
}

function getOrInitBucket(key: string, windowMs: number): Counter {
  const now = nowMs();
  const existing = buckets.get(key);
  if (!existing || now >= existing.resetAt) {
    const fresh = { count: 0, resetAt: now + windowMs };
    buckets.set(key, fresh);
    return fresh;
  }
  return existing;
}

export function rateLimit(req: Request, routeKey: string, limit: number, windowMs: number): NextResponse | null {
  const ip = getClientIp(req);
  const bucket = getOrInitBucket(`${routeKey}:${ip}`, windowMs);
  bucket.count += 1;
  if (bucket.count <= limit) return null;

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - nowMs()) / 1000));
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    },
  );
}

export function requireAdmin(req: Request): NextResponse | null {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    return NextResponse.json({ error: "ADMIN_API_KEY not configured" }, { status: 503 });
  }
  const provided = req.headers.get("x-admin-key");
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/** Avoid leaking RPC URLs, revert data, or stack traces to clients. */
export function sanitizeApiError(err: unknown): string {
  void err;
  return "Request failed";
}

/** Rate-limit idempotent background job starts from public HTTP handlers. */
export function rateLimitJobStart(req: Request, jobKey: string): NextResponse | null {
  return rateLimit(req, `job-start:${jobKey}`, 30, 60_000);
}
