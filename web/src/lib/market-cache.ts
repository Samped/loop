type CacheEntry<T> = { data: T; expiresAt: number };

const cache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data as T;
}

export function getStale<T>(key: string): T | null {
  const entry = cache.get(key);
  return entry ? (entry.data as T) : null;
}

export function setCached<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export async function cachedFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<{ data: T; stale: boolean; fromCache: boolean }> {
  const fresh = getCached<T>(key);
  if (fresh) return { data: fresh, stale: false, fromCache: true };

  try {
    const data = await fetcher();
    setCached(key, data, ttlMs);
    return { data, stale: false, fromCache: false };
  } catch {
    const stale = getStale<T>(key);
    if (stale) return { data: stale, stale: true, fromCache: true };
    throw new Error(`Cache miss for ${key}`);
  }
}
