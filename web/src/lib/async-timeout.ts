/** Shared server-side timeout for optional live market API refresh. */
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, sleep(ms).then(() => null)]);
}
